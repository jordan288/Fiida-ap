# Fayda PDF to CR80 ID Card Converter (Python Edition)

A small, high-performance Python package to convert Ethiopian Fayda PDF slips into standard CR80 ISO/IEC 7810 PVC ID cards at 300 DPI.

## 📁 Small Folder Structure
```
python_converter/
├── fayda/
│   ├── __init__.py
│   ├── extractor.py       # PyMuPDF slip parser & region cropper
│   ├── card_builder.py    # CR80 front & back generator (Pillow)
│   └── a4_sheet.py        # 5-in-1 A4 layout builder for PVC printing
├── convert.py             # 1-command CLI converter
├── app.py                 # Minimal Flask web UI
├── requirements.txt       # Clean standard libraries
└── README.md
```

## 🚀 Quick Setup (3 Steps)

### 1. Install Dependencies
```bash
pip install -r requirements.txt
```

### 2. Run Single or Batch Conversion via CLI
```bash
# Convert a single PDF
python convert.py my_slip.pdf

# Convert all PDFs in a folder and create an A4 5-in-1 sheet
python convert.py *.pdf --a4-sheet --output ./cards/
```

### 3. (Optional) Run the Local Web Interface
```bash
python app.py
# Open http://localhost:5000 in your browser
```

## 🎯 Features
- **Accurate**: Uses PyMuPDF (`fitz`) for fast rasterization and font-accurate text parsing.
- **Ultra-sharp 300 DPI**: Generates 1012x638px CR80 standard front and back cards.
- **A4 5-in-1 Sheet**: Ready for direct PVC tray or thermal card laminator printing.
