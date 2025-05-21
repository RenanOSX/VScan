from __future__ import annotations

import base64, io, json, os, re, tempfile, traceback, pytesseract, requests, cv2
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
from datetime import datetime
from PIL import Image

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_ACCOUNT_FILE = os.path.join(BASE_DIR, "creds.json")
SPREADSHEET_ID = "1FVcGb3GG1eii4JReZ9SVKIfKS20DW6p2oCAMQ0VHPdU"
load_dotenv(".env.local")
try:
    PATH_POPPLER = os.getenv("PATH_POPPLER")
except FileNotFoundError:
    print("ERRO: Variável de ambiente PATH_POPPLER não encontrada.")

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
    
# Tesseract

def melhorar_imagem(caminho_imagem):
    img = cv2.imread(caminho_imagem, cv2.IMREAD_GRAYSCALE)
    img = cv2.bilateralFilter(img, 9, 75, 75)
    img = cv2.adaptiveThreshold(img, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                cv2.THRESH_BINARY, 31, 2)
    img = cv2.resize(img, (img.shape[1]*2, img.shape[0]*2), interpolation=cv2.INTER_CUBIC)
    return Image.fromarray(img)

def extrair_texto(imagem_pil):
    return pytesseract.image_to_string(imagem_pil, lang='por', config='--psm 6')

def limpar_texto(texto):
    return texto.replace('|', ' ').replace('│', ' ').replace('┤', ' ')

def _f(v):
    return float(v.replace('.', '').replace(',', '.')) if v else None

def _data_iso(data_br):
    try:
        return datetime.strptime(data_br, "%d/%m/%Y").date().isoformat()
    except:
        return data_br

def extrair_campos(texto):
    resultado = {}
    cnpj_match = re.search(r"(\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})", texto)
    resultado['cnpj'] = cnpj_match.group(1) if cnpj_match else None
    data_match = re.search(r"Data.{0,5}miss[a-z]?[oã]?\s*[:\-]?\s*(\d{2}/\d{2}/\d{4})", texto, re.IGNORECASE)
    if not data_match:
        datas = re.findall(r"\d{2}/\d{2}/\d{4}", texto)
        resultado['data_emissao'] = _data_iso(datas[-1]) if datas else None
    else:
        resultado['data_emissao'] = _data_iso(data_match.group(1))

    resultado['descricao'] = []
    linhas = texto.splitlines()
    capturando = False

    for linha in linhas:
        linha = limpar_texto(linha.strip())
        if not linha:
            continue

        if not capturando and all(p in linha.lower() for p in ['descricao', 'cst', 'cfop']):
            capturando = True
            continue

        if capturando:
            partes = re.split(r'\s{2,}|\s\|\s|[|│]', linha)
            partes = [p.strip() for p in partes if p.strip()]
            if len(partes) >= 14:
                item = {
                    'codigo': partes[0],
                    'descricao': partes[1],
                    'ncm': partes[2],
                    'cst': partes[3],
                    'cfop': partes[4],
                    'un': partes[5],
                    'qtde': _f(partes[6]),
                    'preco_unit': _f(partes[7]),
                    'preco_total': _f(partes[8]),
                    'base_icms': _f(partes[9]),
                    'valor_icms': _f(partes[10]),
                    'valor_ipi': _f(partes[11]),
                    'perc_icms': _f(partes[12]),
                    'perc_ipi': _f(partes[13])
                }
                resultado['descricao'].append(item)

    return resultado

def processar_nota(caminho_imagem):
    imagem = melhorar_imagem(caminho_imagem)
    texto = extrair_texto(imagem)
    campos = extrair_campos(texto)
    return campos

@app.route('/scan_tesseract', methods=['POST'])
def scan_tesseract():
    try:
        # Recebe arquivo ou imagem base64
        f = request.files.get('file')
        is_pdf = False
        temp_path = None

        if f:
            is_pdf = f.filename.lower().endswith('.pdf') or f.mimetype == 'application/pdf'
            temp_path = os.path.join(BASE_DIR, 'temp_tesseract.pdf' if is_pdf else 'temp_tesseract.png')
            f.save(temp_path)
        elif request.is_json:
            data = request.get_json()
            if data and 'image' in data:
                img_bytes = base64.b64decode(data['image'])
                temp_path = os.path.join(BASE_DIR, 'temp_tesseract.png')
                with open(temp_path, 'wb') as temp_img:
                    temp_img.write(img_bytes)
                is_pdf = False
            else:
                return jsonify({'success': False, 'error': 'No file or image provided'}), 400
        else:
            return jsonify({'success': False, 'error': 'No file or image provided'}), 400

        results = []

        if is_pdf:
            # Converte PDF em imagens
            pages = convert_from_path(
                temp_path,
                poppler_path=PATH_POPPLER
            )
            os.unlink(temp_path)  # Remove o PDF temporário
            for idx, page in enumerate(pages):
                with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as temp_img:
                    page.save(temp_img.name, format='PNG')
                    img_path = temp_img.name
                try:
                    campos = processar_nota(img_path)
                    fields = {
                        'data_emissao': campos.get('data_emissao'),
                        'cnpj': campos.get('cnpj'),
                        'valor_total': campos.get('valor_total'),
                        'nome_loja': campos.get('nome_loja')
                    }
                    itens = campos.get('itens', [])
                    results.append({
                        'fields': fields,
                        'itens': itens,
                        'page': idx + 1
                    })
                except Exception as ocr_error:
                    print(f"Erro no Tesseract na página {idx+1}: {ocr_error}")
                    results.append({
                        'fields': {'data_emissao': None, 'valor_total': None, 'cnpj': None, 'nome_loja': None},
                        'itens': [],
                        'page': idx + 1,
                        'error': str(ocr_error)
                    })
                finally:
                    os.unlink(img_path)
            return jsonify({'success': True, 'results': results})
        else:
            campos = processar_nota(temp_path)
            fields = {
                'data_emissao': campos.get('data_emissao'),
                'cnpj': campos.get('cnpj'),
                'valor_total': campos.get('valor_total'),
                'nome_loja': campos.get('nome_loja')
            }
            itens = campos.get('itens', [])
            os.unlink(temp_path)
            return jsonify({'success': True, 'fields': fields, 'itens': itens})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)