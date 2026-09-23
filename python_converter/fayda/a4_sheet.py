"""
A4 5-in-1 Sheet Batch Print Layout Generator for CR80 PVC printing.
A4 at 300 DPI: 2480 x 3508 pixels.
"""

from PIL import Image
from typing import List, Tuple


A4_WIDTH = 2480
A4_HEIGHT = 3508


def create_a4_print_sheet(card_pairs: List[Tuple[Image.Image, Image.Image]], layout: str = "5-in-1") -> Image.Image:
    """
    Arranges front and back cards onto a standard 300 DPI A4 sheet for high-quality printing.
    """
    sheet = Image.new("RGB", (A4_WIDTH, A4_HEIGHT), (255, 255, 255))

    # Standard margin & spacing
    margin_x = 180
    margin_y = 160
    gap_y = 60
    gap_x = 100

    # Max 5 cards per page
    for i, (front, back) in enumerate(card_pairs[:5]):
        y = margin_y + i * (front.height + gap_y)

        # Front on Left
        sheet.paste(front, (margin_x, y))

        # Back on Right
        sheet.paste(back, (margin_x + front.width + gap_x, y))

    return sheet
