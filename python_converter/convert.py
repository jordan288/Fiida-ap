#!/usr/bin/env python3
"""
Simple 1-Command Fayda Slip Converter CLI
Usage:
    python convert.py slip.pdf
    python convert.py *.pdf --output ./output_cards/
"""

import os
import sys
import argparse
from fayda.extractor import extract_slip_data
from fayda.card_builder import render_cr80_card
from fayda.a4_sheet import create_a4_print_sheet


def process_single_pdf(pdf_path: str, output_dir: str):
    print(f"📄 Processing: {pdf_path}")
    data, page_img = extract_slip_data(pdf_path)

    base_name = os.path.splitext(os.path.basename(pdf_path))[0]
    front, back = render_cr80_card(data)

    front_path = os.path.join(output_dir, f"{base_name}_front.png")
    back_path = os.path.join(output_dir, f"{base_name}_back.png")

    front.save(front_path, dpi=(300, 300))
    back.save(back_path, dpi=(300, 300))

    print(f"  ✓ Saved Front: {front_path}")
    print(f"  ✓ Saved Back:  {back_path}")
    return front, back


def main():
    parser = argparse.ArgumentParser(description="Convert Fayda PDF slip into CR80 300 DPI PVC ID Cards.")
    parser.add_argument("pdf_files", nargs="+", help="Path to one or more Fayda PDF slip files")
    parser.add_argument("--output", "-o", default="./output_cards", help="Output directory for generated cards")
    parser.add_argument("--a4-sheet", action="store_true", help="Also generate an A4 5-in-1 print sheet")

    args = parser.parse_args()
    os.makedirs(args.output, exist_ok=True)

    pairs = []
    for pdf_file in args.pdf_files:
        if not os.path.isfile(pdf_file):
            print(f"⚠️ Skipping missing file: {pdf_file}")
            continue
        try:
            front, back = process_single_pdf(pdf_file, args.output)
            pairs.append((front, back))
        except Exception as e:
            print(f"❌ Error converting {pdf_file}: {e}")

    if args.a4_sheet and pairs:
        sheet = create_a4_print_sheet(pairs)
        sheet_path = os.path.join(args.output, "a4_print_sheet_5in1.png")
        sheet.save(sheet_path, dpi=(300, 300))
        print(f"🖨️ Saved A4 5-in-1 Print Sheet: {sheet_path}")

    print(f"\n✨ Done! Processed {len(pairs)} cards into '{args.output}'.")


if __name__ == "__main__":
    main()
