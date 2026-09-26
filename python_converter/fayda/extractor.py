"""
Position-Mapped Fayda PDF Slip Extractor using PyMuPDF (fitz) and Pillow.
Extracts text and crops strictly from calibrated Position Mapper coordinates.
"""

from dataclasses import dataclass
from typing import Optional, Tuple, Dict
import re
import fitz  # PyMuPDF
from PIL import Image
import io

@dataclass
class SlipData:
    full_name_amharic: str = ""
    full_name_english: str = ""
    fan: str = ""
    fin: str = ""
    fcn: str = ""
    date_of_birth: str = ""
    date_of_birth_eth: str = ""
    sex: str = ""
    date_of_issue: str = ""
    date_of_issue_eth: str = ""
    date_of_expiry: str = ""
    nationality: str = "Ethiopian / ኢትዮጵያዊ"
    phone_number: str = ""
    region: str = ""
    zone: str = ""
    woreda: str = ""
    photo_bytes: Optional[bytes] = None
    qr_bytes: Optional[bytes] = None
    barcode_bytes: Optional[bytes] = None


# Default fallback bounding boxes (normalized 0.0 - 1.0: x, y, width, height)
DEFAULT_MAPPER_REGIONS = {
    "name_amharic": (0.05, 0.42, 0.45, 0.05),
    "name_english": (0.05, 0.47, 0.45, 0.05),
    "fan": (0.28, 0.58, 0.44, 0.06),
    "dob": (0.28, 0.65, 0.30, 0.05),
    "sex": (0.28, 0.70, 0.20, 0.04),
    "phone": (0.28, 0.75, 0.25, 0.04),
    "address_block": (0.45, 0.48, 0.40, 0.35), # Strict right-column crop to ignore footer
    "photo": (0.05, 0.58, 0.22, 0.25),
    "qr": (0.72, 0.58, 0.23, 0.25)
}


def to_rect(box: tuple, page_rect: fitz.Rect) -> fitz.Rect:
    """Converts (x_pct, y_pct, w_pct, h_pct) to a PyMuPDF fitz.Rect."""
    x_pct, y_pct, w_pct, h_pct = box
    x0 = page_rect.x0 + x_pct * page_rect.width
    y0 = page_rect.y0 + y_pct * page_rect.height
    x1 = x0 + w_pct * page_rect.width
    y1 = y0 + h_pct * page_rect.height
    return fitz.Rect(x0, y0, x1, y1)


def extract_slip_data(pdf_path_or_bytes, custom_mapper: Optional[Dict] = None) -> Tuple[SlipData, Image.Image]:
    """
    Parses a Fayda PDF slip directly using Position Mapper zones.
    """
    if isinstance(pdf_path_or_bytes, bytes):
        doc = fitz.open(stream=pdf_path_or_bytes, filetype="pdf")
    else:
        doc = fitz.open(pdf_path_or_bytes)

    if len(doc) == 0:
        raise ValueError("The provided PDF file contains no pages.")

    page = doc[0]
    p_rect = page.rect
    regions = {**DEFAULT_MAPPER_REGIONS, **(custom_mapper or {})}

    # Render page at 300 DPI for high-res cropping
    matrix = fitz.Matrix(300 / 72, 300 / 72)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    page_img = Image.open(io.BytesIO(pix.tobytes("png")))
    img_w, img_h = page_img.size

    data = SlipData()

    # 1. Exact Field Extraction via Clip Rectangles
    def get_clipped_text(region_key: str) -> str:
        if region_key not in regions:
            return ""
        rect = to_rect(regions[region_key], p_rect)
        raw = page.get_text("text", clip=rect)
        return " ".join([ln.strip() for ln in raw.split("\n") if ln.strip()])

    # Amharic & English Names from mapped boxes
    data.full_name_amharic = get_clipped_text("name_amharic")
    data.full_name_english = get_clipped_text("name_english")

    # FAN (16 Digits)
    fan_text = get_clipped_text("fan")
    fan_digits = re.sub(r"\D", "", fan_text)
    if len(fan_digits) >= 16:
        fan_digits = fan_digits[:16]
        data.fan = " ".join([fan_digits[i:i+4] for i in range(0, 16, 4)])

    # Phone Number from mapped phone box
    phone_raw = get_clipped_text("phone")
    phone_match = re.search(r"(?<!\d)(\+251[79]\d{8}|0[79]\d{8})(?!\d)", phone_raw)
    if phone_match:
        data.phone_number = phone_match.group(1)

    # DOB & Sex from mapped boxes
    dob_raw = get_clipped_text("dob")
    dates = re.findall(r"(?<!\d)(\d{2}/\d{2}/\d{4})(?!\d)", dob_raw)
    if dates:
        data.date_of_birth = dates[0]
    eth_dates = re.findall(r"(?<!\d)(\d{2}/\d{2}/\d{4})\s*(?:ዓ\.ም\.?|E\.C\.?)", dob_raw)
    if eth_dates:
        data.date_of_birth_eth = eth_dates[0]

    sex_raw = get_clipped_text("sex")
    if "ሴት" in sex_raw or "Female" in sex_raw or "F" in sex_raw:
        data.sex = "Female / ሴት"
    elif "ወንድ" in sex_raw or "Male" in sex_raw or "M" in sex_raw:
        data.sex = "Male / ወንድ"

  # --- ROBUST ADDRESS EXTRACTION ---
    # Crop exactly to the address block and sort=True to ensure logical reading order
    if "address_block" in regions:
        addr_rect = to_rect(regions["address_block"], p_rect)
        address_text = page.get_text("text", clip=addr_rect, sort=True)
    else:
        address_text = page.get_text("text", sort=True)

    def clean_address_string(text: str) -> str:
        """Removes messy punctuation and flattens newlines into spaces."""
        text = re.sub(r'[\|/:]', '', text) # Remove stray pipes, slashes, colons
        text = re.sub(r'\s+', ' ', text)   # Convert multiple spaces/newlines to single space
        return text.strip()

    # Extract Region (Grabs everything between Region and Zone, regardless of newlines)
    reg_match = re.search(r"(?:Region|ክልል)[\s\/:\|]*(.*?)(?=(?:Zone|Subcity|Sub City|ዞን|ክፍለ ከተማ|ክ/ከተማ))", address_text, re.IGNORECASE | re.DOTALL)
    if reg_match:
        data.region = clean_address_string(reg_match.group(1))

    # Extract Zone (Grabs everything between Zone and Woreda)
    zone_match = re.search(r"(?:Subcity|Sub City|Zone|ዞን|ክፍለ ከተማ|ክ/ከተማ)[\s\/:\|]*(.*?)(?=(?:Woreda|ወረዳ))", address_text, re.IGNORECASE | re.DOTALL)
    if zone_match:
        data.zone = clean_address_string(zone_match.group(1))

    # Extract Woreda (Grabs everything from Woreda until Kebele or footer markers)
    wor_match = re.search(r"(?:Woreda|ወረዳ)[\s\/:\|]*(.*?)(?=(?:Kebele|ቀበሌ|House|የቤት|Disclaimer|ማሳሰቢያ|የኢትዮጵያ|$))", address_text, re.IGNORECASE | re.DOTALL)
    if wor_match:
        data.woreda = clean_address_string(wor_match.group(1))
    # --------------------------------
    # 2. Targeted Image / Photo Crop using mapped coordinates
    if "photo" in regions:
        px, py, pw, ph = regions["photo"]
        crop_box = (int(img_w * px), int(img_h * py), int(img_w * (px + pw)), int(img_h * (py + ph)))
        cropped_photo = page_img.crop(crop_box)
        buf = io.BytesIO()
        cropped_photo.save(buf, format="PNG")
        data.photo_bytes = buf.getvalue()

    # 3. Targeted QR Crop using mapped coordinates
    if "qr" in regions:
        qx, qy, qw, qh = regions["qr"]
        crop_box = (int(img_w * qx), int(img_h * qy), int(img_w * (qx + qw)), int(img_h * (qy + qh)))
        cropped_qr = page_img.crop(crop_box)
        buf = io.BytesIO()
        cropped_qr.save(buf, format="PNG")
        data.qr_bytes = buf.getvalue()

    return data, page_img