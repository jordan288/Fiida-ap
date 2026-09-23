#!/usr/bin/env python3
"""
Simple Lightweight Local Web UI (Flask) for Fayda Card Converter.
Usage:
    python app.py
    Open http://localhost:5000 in your browser.
"""

from flask import Flask, request, jsonify, send_file, render_template_string
import os
import io
import zipfile
from fayda.extractor import extract_slip_data
from fayda.card_builder import render_cr80_card
from fayda.a4_sheet import create_a4_print_sheet

app = Flask(__name__)
app.config['MAX_CONTENT_LENGTH'] = 64 * 1024 * 1024  # 64MB

HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Fayda Card Converter (Python Edition)</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-slate-900 text-slate-100 min-h-screen p-6 font-sans">
  <div class="max-w-3xl mx-auto space-y-6">
    <div class="text-center space-y-2">
      <h1 class="text-2xl font-bold text-emerald-400">Fayda PDF to CR80 ID Card Converter</h1>
      <p class="text-xs text-slate-400">Simple Python Edition • PyMuPDF & Pillow • CR80 300 DPI</p>
    </div>

    <form method="POST" action="/convert" enctype="multipart/form-data" class="bg-slate-800 p-8 rounded-2xl border border-slate-700 text-center space-y-4">
      <div class="border-2 border-dashed border-slate-600 hover:border-emerald-500 rounded-xl p-8 transition-colors cursor-pointer">
        <input type="file" name="pdf_files" multiple accept="application/pdf" required class="block w-full text-sm text-slate-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-500 cursor-pointer" />
        <p class="text-xs text-slate-400 mt-2">Select 1 or more Fayda PDF slips</p>
      </div>

      <div class="flex items-center justify-center gap-4">
        <label class="flex items-center gap-2 text-xs text-slate-300">
          <input type="checkbox" name="a4_sheet" checked class="rounded text-emerald-600" />
          Include A4 5-in-1 Print Sheet
        </label>
      </div>

      <button type="submit" class="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-lg">
        Convert to CR80 PVC Cards (Download ZIP)
      </button>
    </form>
  </div>
</body>
</html>
"""

@app.route('/')
def index():
    return render_template_string(HTML_TEMPLATE)

@app.route('/convert', methods=['POST'])
def convert():
    files = request.files.getlist('pdf_files')
    if not files or files[0].filename == '':
        return "No files selected", 400

    zip_buf = io.BytesIO()
    card_pairs = []

    with zipfile.ZipFile(zip_buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for file in files:
            if not file.filename.lower().endswith('.pdf'):
                continue
            pdf_bytes = file.read()
            data, _ = extract_slip_data(pdf_bytes)
            front, back = render_cr80_card(data)
            card_pairs.append((front, back))

            base_name = os.path.splitext(file.filename)[0]

            f_buf = io.BytesIO()
            front.save(f_buf, format='PNG', dpi=(300, 300))
            zf.writestr(f"{base_name}_front.png", f_buf.getvalue())

            b_buf = io.BytesIO()
            back.save(b_buf, format='PNG', dpi=(300, 300))
            zf.writestr(f"{base_name}_back.png", b_buf.getvalue())

        if request.form.get('a4_sheet') and card_pairs:
            sheet = create_a4_print_sheet(card_pairs)
            s_buf = io.BytesIO()
            sheet.save(s_buf, format='PNG', dpi=(300, 300))
            zf.writestr("a4_5in1_print_sheet.png", s_buf.getvalue())

    zip_buf.seek(0)
    return send_file(zip_buf, mimetype='application/zip', as_attachment=True, download_name='fayda_cr80_cards.zip')

if __name__ == '__main__':
    print("Starting Fayda Python Converter on http://127.0.0.1:5000")
    app.run(host='0.0.0.0', port=5000, debug=True)
