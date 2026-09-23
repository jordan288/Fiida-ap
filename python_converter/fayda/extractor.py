"""
Fayda PDF Slip Extractor using PyMuPDF (fitz) and Pillow.
Extracts:
 - Portrait Photo
 - Biometric QR Code
 - Fayda FAN (16 digits)
 - Amharic & English Demographic text
"""

from dataclasses import dataclass
from typing import Optional, Tuple
import re
import fitz  # PyMuPDF
from PIL import Image
import io


@dataclass
class SlipData:
    full_name_amharic: str = ""
    full_name_english: str = ""
    fan: str = ""  # 16-digit Fayda Identification Number
    fcn: str = ""
    date_of_birth: str = ""
    date_of_birth_eth: str = ""
    sex: str = "Male"
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


def extract_slip_data(pdf_path_or_bytes) -> Tuple[SlipData, Image.Image]:
    """
    Parses a Fayda PDF slip using PyMuPDF (fitz).
    Returns extracted SlipData and a high-res PIL render of page 1.
    """
    if isinstance(pdf_path_or_bytes, bytes):
        doc = fitz.open(stream=pdf_path_or_bytes, filetype="pdf")
    else:
        doc = fitz.open(pdf_path_or_bytes)

    if len(doc) == 0:
        raise ValueError("The provided PDF file contains no pages.")

    page = doc[0]
    # Render page at 300 DPI for ultra-sharp photo and QR crops (matrix 300/72 ≈ 4.166)
    matrix = fitz.Matrix(300 / 72, 300 / 72)
    pix = page.get_pixmap(matrix=matrix, alpha=False)
    page_img = Image.open(io.BytesIO(pix.tobytes("png")))

    w, h = page_img.size
    data = SlipData()

    # 1. Extract plain text content
    text = page.get_text("text")
    lines = [ln.strip() for ln in text.split("\n") if ln.strip()]

    # Extract 16-digit FAN: e.g. 4195 0436 7069 2582 or 4195043670692582
    fan_match = re.search(r"\b(\d{4}\s?\d{4}\s?\d{4}\s?\d{4})\b", text)
    if fan_match:
        data.fan = fan_match.group(1).replace(" ", "")
        # Format as 4 groups of 4
        data.fan = " ".join([data.fan[i:i+4] for i in range(0, 16, 4)])

    # Extract Phone: 09... or 07...
    phone_match = re.search(r"\b(09\d{8}|07\d{8}|\+251\d{9})\b", text)
    if phone_match:
        data.phone_number = phone_match.group(1)

    # Extract Dates: DD/MM/YYYY
    dates = re.findall(r"\b\d{2}/\d{2}/\d{4}\b", text)
    if dates:
        data.date_of_birth = dates[0]
        if len(dates) > 1:
            data.date_of_issue = dates[1]
        if len(dates) > 2:
            data.date_of_expiry = dates[2]

    # Look for Amharic and English names
    for i, line in enumerate(lines):
        # Amharic name line usually contains Fidel characters
        if re.search(r"[\u1200-\u137F]{2,}", line) and not data.full_name_amharic:
            if not any(k in line for k in ["ስም", "የተሰጠበት", "መለያ", "ኢትዮጵያ"]):
                data.full_name_amharic = line
                if i + 1 < len(lines) and re.match(r"^[A-Za-z\s]+$", lines[i+1]):
                    data.full_name_english = lines[i+1]
        elif re.match(r"^[A-Z][a-z]+ [A-Z][a-z]+", line) and not data.full_name_english:
            data.full_name_english = line

    # 2. Extract embedded images or crop by standard Fayda bounding boxes
    image_list = page.get_images(full=True)
    for img_info in image_list:
        xref = img_info[0]
        base_image = doc.extract_image(xref)
        img_bytes = base_image["image"]
        img_ext = base_image["ext"]
        img_w = base_image["width"]
        img_h = base_image["height"]

        # Photos are typically portrait ratio ~ 3:4 and medium/large resolution
        if 0.7 <= (img_w / img_h) <= 0.9 and img_h > 150:
            if not data.photo_bytes:
                data.photo_bytes = img_bytes
        # QR codes are square ~ 1:1 ratio
        elif 0.9 <= (img_w / img_h) <= 1.1 and img_w > 100:
            if not data.qr_bytes:
                data.qr_bytes = img_bytes

    # Fallback to calibrated region cropping if images not directly embedded as streams
    if not data.photo_bytes:
        # Standard Fayda slip photo crop box (approx 5.5% x, 58% y, 22% w, 24% h on A4)
        crop_box = (int(w * 0.05), int(h * 0.58), int(w * 0.28), int(h * 0.83))
        cropped = page_img.crop(crop_box)
        buf = io.BytesIO()
        cropped.save(buf, format="PNG")
        data.photo_bytes = buf.getvalue()

    if not data.qr_bytes:
        # Standard Fayda slip QR crop box (approx 72% x, 58% y, 23% w, 23% h)
        crop_box = (int(w * 0.72), int(h * 0.58), int(w * 0.96), int(h * 0.82))
        cropped = page_img.crop(crop_box)
        buf = io.BytesIO()
        cropped.save(buf, format="PNG")
        data.qr_bytes = buf.getvalue()

    return data, page_img
