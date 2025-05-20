from __future__ import annotations

import base64
import io
import json
import os
import re
import tempfile
import traceback
from statistics import mean
from typing import Any, Dict, List, Tuple

from dotenv import load_dotenv
from flask import Flask, jsonify, request
from flask_cors import CORS
from google.auth.transport.requests import Request
from google.cloud import vision_v1
from google.oauth2 import service_account
from google.protobuf.json_format import MessageToDict
from pdf2image import convert_from_path
import requests

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_ACCOUNT_FILE = os.path.join(BASE_DIR, "creds.json")
SPREADSHEET_ID = "1FVcGb3GG1eii4JReZ9SVKIfKS20DW6p2oCAMQ0VHPdU"
load_dotenv(".env.local")
PATH_POPPLER = os.getenv("PATH_POPPLER") or r"C:\\Programas\\poppler\\bin"

SCOPES = ["https://www.googleapis.com/auth/spreadsheets"]
SHEETS_URL = (
    f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}"
    "/values/Página1!A1:E:append?valueInputOption=RAW"
)

vision_client = vision_v1.ImageAnnotatorClient.from_service_account_file(SERVICE_ACCOUNT_FILE)
creds = service_account.Credentials.from_service_account_file(
    SERVICE_ACCOUNT_FILE, scopes=SCOPES
)

app = Flask(__name__)
CORS(app, origins="*")

def ocr_bytes(img_bytes: bytes) -> Tuple[str, List[Dict[str, Any]]]:
    image = vision_v1.Image(content=img_bytes)
    resp = vision_client.document_text_detection(image=image)
    if resp.error.message:
        raise RuntimeError(resp.error.message)

    raw = MessageToDict(resp._pb)
    words: List[Dict[str, Any]] = []
    for page in raw.get("fullTextAnnotation", {}).get("pages", []):
        for block in page.get("blocks", []):
            for para in block.get("paragraphs", []):
                for word in para.get("words", []):
                    text = "".join(sym.get("text", "") for sym in word.get("symbols", []))
                    verts = word.get("boundingBox", {}).get("vertices", [])
                    xs, ys = zip(*[(v.get("x", 0), v.get("y", 0)) for v in verts]) if verts else ([0], [0])
                    words.append({"text": text, "x": mean(xs), "y": mean(ys)})
    return resp.full_text_annotation.text, words

def group_lines(words: List[Dict[str, Any]], thresh: int = 10) -> List[List[Dict[str, Any]]]:
    lines: List[List[Dict[str, Any]]] = []
    for w in sorted(words, key=lambda x: x["y"]):
        for line in lines:
            if abs(mean([i["y"] for i in line]) - w["y"]) <= thresh:
                line.append(w)
                break
        else:
            lines.append([w])
    return lines

def lines_to_text(lines: List[List[Dict[str, Any]]]) -> List[str]:
    return [
        " ".join(
            sorted([w["text"] for w in line], key=lambda t: next(x["x"] for x in line if x["text"] == t))
        )
        for line in lines
    ]

def parse_fields(full_text: str, lines: List[str]) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "data_emissao": None,
        "valor_total": None,
        "cnpj": None,
        "nome_loja": None,
    }
    if m := re.search(r"(\d{2}[\/-]\d{2}[\/-]\d{2,4})", full_text):
        data["data_emissao"] = m.group(1)
    if cnpj := re.search(r"(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})", full_text):
        data["cnpj"] = cnpj.group(1)
    for i, ln in enumerate(lines):
        if "valor total" in ln.lower():
            nums = re.findall(r"\d+[\d\.,]*\d*", ln) or (
                re.findall(r"\d+[\d\.,]*\d*", lines[i + 1]) if i + 1 < len(lines) else []
            )
            if nums:
                data["valor_total"] = nums[-1]
            break
    return data

def parse_items(lines: List[List[Dict[str, Any]]]) -> List[Dict[str, str]]:
    txt_lines = lines_to_text(lines)
    start = next((i for i, l in enumerate(txt_lines) if "itens" in l.lower()), None)
    if start is None:
        return []
    items: List[Dict[str, str]] = []
    for ln in txt_lines[start + 2:]:
        parts = ln.split()
        prices = [p for p in parts if re.match(r"^[\d\.]+,\d{2}$", p)]
        if len(prices) < 2:
            continue
        unit, total = prices[:2]
        try:
            qty = str(
                int(
                    round(
                        float(total.replace(".", "").replace(",", ".")) /
                        float(unit.replace(".", "").replace(",", "."))
                    )
                )
            )
        except ZeroDivisionError:
            qty = "1"
        desc = " ".join(parts[:parts.index(unit)])
        items.append({"descricao": desc, "quantidade": qty, "preco_total": total})
    return items

def append_sheet(fields: Dict[str, Any], items: List[Dict[str, str]]) -> bool:
    try:
        creds.refresh(Request())
        headers = {
            "Authorization": f"Bearer {creds.token}",
            "Content-Type": "application/json",
        }
        body = {
            "values": [
                [
                    fields.get("data_emissao"),
                    fields.get("valor_total"),
                    fields.get("cnpj"),
                    fields.get("nome_loja"),
                    json.dumps(items, ensure_ascii=False),
                ]
            ]
        }
        res = requests.post(SHEETS_URL, headers=headers, json=body)
        print('DEBUG: Body enviado ao Sheets:', json.dumps(body, ensure_ascii=False))
        print('DEBUG: Status da resposta:', res.status_code)
        print('DEBUG: Texto da resposta:', res.text)
        res.raise_for_status()
        return True
    except Exception:
        print('ERRO ao tentar enviar para o Google Sheets:')
        traceback.print_exc()
        return False

def img_from_request() -> Tuple[bytes | None, bool]:
    f = request.files.get("file")
    if f:
        is_pdf = f.filename.lower().endswith(".pdf") or f.mimetype == "application/pdf"
        return f.read(), is_pdf
    if request.is_json and (b64 := request.json.get("image")):
        return base64.b64decode(b64), False
    return None, False

@app.get("/health")
def health():
    return jsonify({"status": "ok"})

@app.post("/scan")
def scan():
    img, is_pdf = img_from_request()
    if img is None:
        print("DEBUG: Nenhuma imagem encontrada na requisição.")
        return jsonify({"success": False, "error": "no_file"}), 400

    try:
        print(f"DEBUG: Tipo do arquivo: {'PDF' if is_pdf else 'Imagem'}")
        if is_pdf:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pdf") as tmp:
                tmp.write(img)
                tmp.flush()
                pages = convert_from_path(tmp.name, poppler_path=PATH_POPPLER)
            results = []
            for i, page in enumerate(pages, 1):
                buf = io.BytesIO(); page.save(buf, format="PNG")
                fields, items = _process_image(buf.getvalue())
                results.append({"page": i, "fields": fields, "itens": items})
            return jsonify({'success': True, 'fields': fields, 'itens': items})
        else:
            fields, items = _process_image(img)
            return jsonify({"success": True, "fields": fields, "itens": items})
    except Exception as e:
        print("ERRO durante o processamento da imagem/PDF:", str(e))
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

def _process_image(img: bytes) -> Tuple[Dict[str, Any], List[Dict[str, str]]]:
    text, words = ocr_bytes(img)
    print('DEBUG: Texto extraído do OCR:', text[:200])
    lines = group_lines(words)
    text_lines = lines_to_text(lines)
    fields = parse_fields(text, text_lines)
    items = parse_items(lines)
    print('DEBUG: Campos extraídos:', fields)
    print('DEBUG: Itens extraídos:', items)
    return fields, items

@app.post("/append")
def append():
    try:
        data = request.get_json()
        print("DEBUG: JSON recebido:", json.dumps(data, ensure_ascii=False, indent=2))
        fields = data.get("fields")
        items = data.get("itens")

        if not isinstance(fields, dict) or not isinstance(items, list):
            print("DEBUG: Campos ou itens com tipos inválidos")
            return jsonify({"success": False, "error": "Formato inválido para fields ou items"}), 400

        ok = append_sheet(fields, items)
        return jsonify({"success": ok}), 200 if ok else 500
    except Exception as e:
        print("ERRO na rota /append:", str(e))
        traceback.print_exc()
        return jsonify({"success": False, "error": str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)