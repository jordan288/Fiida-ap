"""
CR80 PVC ID Card Builder (Front & Back) at 300 DPI.
CR80 dimensions: 85.6mm x 53.98mm -> 1012 x 638 pixels at 300 DPI.
"""

from PIL import Image, ImageDraw, ImageFont
import io
from typing import Tuple
from .extractor import SlipData


CR80_WIDTH = 1012
CR80_HEIGHT = 638


def render_cr80_card(data: SlipData) -> Tuple[Image.Image, Image.Image]:
    """
    Renders front and back CR80 cards as high-res 300 DPI PIL Images.
    """
    # 1. Front Card
    front = Image.new("RGB", (CR80_WIDTH, CR80_HEIGHT), (255, 255, 255))
    draw_f = ImageDraw.Draw(front)

    # Decorative header bar (Ethiopian national identity accents)
    draw_f.rectangle([(0, 0), (CR80_WIDTH, 70)], fill=(16, 92, 54))  # Green banner
    draw_f.rectangle([(0, 70), (CR80_WIDTH, 78)], fill=(244, 180, 26))  # Gold stripe
    draw_f.rectangle([(0, 78), (CR80_WIDTH, 84)], fill=(217, 48, 37))  # Red accent

    # Basic system font fallback
    font_title = ImageFont.load_default()
    font_bold = ImageFont.load_default()
    font_normal = ImageFont.load_default()

    draw_f.text((120, 25), "FEDERAL DEMOCRATIC REPUBLIC OF ETHIOPIA - FAYDA ID", fill=(255, 255, 255), font=font_title)

    # Photo (Left)
    if data.photo_bytes:
        try:
            photo_img = Image.open(io.BytesIO(data.photo_bytes)).convert("RGB")
            photo_resized = photo_img.resize((240, 310), Image.Resampling.LANCZOS)
            front.paste(photo_resized, (50, 150))
            draw_f.rectangle([(48, 148), (292, 462)], outline=(180, 180, 180), width=2)

            # Small Security Photo (Direct copy from larger photo, no second layer)
            small_sec = photo_img.resize((140, 170), Image.Resampling.LANCZOS)
            front.paste(small_sec, (825, 435))
        except Exception:
            draw_f.rectangle([(50, 150), (290, 460)], fill=(230, 230, 230), outline=(150, 150, 150))

    # Details (Right)
    text_x = 320
    draw_f.text((text_x, 150), f"Full Name: {data.full_name_amharic or 'Ayele Tesfaye'}", fill=(20, 20, 20), font=font_bold)
    draw_f.text((text_x, 180), f"English:   {data.full_name_english or 'Ayele Tesfaye Megersa'}", fill=(80, 80, 80), font=font_normal)

    draw_f.text((text_x, 230), f"FAN / ፋይዳ ቁጥር: {data.fan or '4195 0436 7069 2582'}", fill=(16, 92, 54), font=font_bold)
    draw_f.text((text_x, 270), f"Date of Birth: {data.date_of_birth or '14/05/1992'}", fill=(40, 40, 40), font=font_normal)
    draw_f.text((text_x, 310), f"Sex / ጾታ:      {data.sex or 'Male'}", fill=(40, 40, 40), font=font_normal)
    draw_f.text((text_x, 350), f"Nationality:   {data.nationality}", fill=(40, 40, 40), font=font_normal)
    draw_f.text((text_x, 390), f"Date of Issue: {data.date_of_issue or '24/07/2024'}", fill=(40, 40, 40), font=font_normal)
    draw_f.text((text_x, 430), f"Expiry Date:   {data.date_of_expiry or '23/07/2034'}", fill=(40, 40, 40), font=font_normal)

    # 2. Back Card
    back = Image.new("RGB", (CR80_WIDTH, CR80_HEIGHT), (255, 255, 255))
    draw_b = ImageDraw.Draw(back)

    # Top header
    draw_b.rectangle([(0, 0), (CR80_WIDTH, 45)], fill=(30, 41, 59))
    draw_b.text((40, 15), "NATIONAL IDENTITY PROGRAM OF ETHIOPIA - RESIDENTIAL ADDRESS", fill=(255, 255, 255), font=font_title)

    # Address block
    draw_b.text((50, 80), f"Phone / ስልክ: {data.phone_number or '0928574836'}", fill=(30, 30, 30), font=font_bold)
    draw_b.text((50, 120), f"Region:       {data.region or 'Sidama / ሲዳማ'}", fill=(50, 50, 50), font=font_normal)
    draw_b.text((50, 160), f"Zone:         {data.zone or 'Arbegona / አርበጎና'}", fill=(50, 50, 50), font=font_normal)
    draw_b.text((50, 200), f"Woreda:       {data.woreda or 'Woreda 01 / ወረዳ 01'}", fill=(50, 50, 50), font=font_normal)

    # QR Code on Back
    if data.qr_bytes:
        try:
            qr_img = Image.open(io.BytesIO(data.qr_bytes)).convert("RGB")
            qr_resized = qr_img.resize((260, 260), Image.Resampling.LANCZOS)
            back.paste(qr_resized, (680, 120))
            draw_b.rectangle([(678, 118), (942, 382)], outline=(200, 200, 200), width=2)
        except Exception:
            draw_b.rectangle([(680, 120), (940, 380)], fill=(240, 240, 240))

    # Bottom notice
    draw_b.line([(40, 560), (CR80_WIDTH - 40, 560)], fill=(210, 210, 210), width=1)
    draw_b.text((40, 580), "This digital card is the official property of the Federal Democratic Republic of Ethiopia.", fill=(120, 120, 120), font=font_normal)

    return front, back
