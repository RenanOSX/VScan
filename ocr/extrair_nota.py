"""
OCR e extração de dados de Nota Fiscal usando Google Cloud Vision.
Integração com Google Sheets via OAuth2 (Service Account JSON).
Disponibiliza endpoint Flask (/scan) para aplicativo mobile.
Inclui debug detalhado para append na planilha e refinamento de valor_total com fallback.
"""
import traceback, os, json, base64, time, re, requests
from statistics import mean
from flask import Flask, request, jsonify
from google.cloud import vision_v1
from google.protobuf.json_format import MessageToDict
from google.oauth2 import service_account
from google.auth.transport.requests import Request
from flask_cors import CORS

app = Flask(__name__)
CORS(app, origins="*", supports_credentials=True)

# --- CONFIGURAÇÃO ---
# Use relative paths within the project structure
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SERVICE_ACCOUNT_FILE = os.path.join(BASE_DIR, "creds.json")
SPREADSHEET_ID = '1FVcGb3GG1eii4JReZ9SVKIfKS20DW6p2oCAMQ0VHPdU'

# Inicializa clientes
vision_client = vision_v1.ImageAnnotatorClient.from_service_account_file(
    SERVICE_ACCOUNT_FILE
)
SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
creds = service_account.Credentials.from_service_account_file(
    SERVICE_ACCOUNT_FILE, scopes=SCOPES
)
# URL correto para append: especifica início em A1 e colunas até E
BASE_SHEETS_URL = (
    f"https://sheets.googleapis.com/v4/spreadsheets/{SPREADSHEET_ID}"
    "/values/Página1!A1:E:append?valueInputOption=RAW"
)


def ocr_document(img_bytes: bytes):
    """Executa Document Text Detection e retorna raw, texto e lista de palavras com centroides."""
    image = vision_v1.Image(content=img_bytes)
    resp = vision_client.document_text_detection(image=image)
    if resp.error.message:
        raise RuntimeError(resp.error.message)
    raw = MessageToDict(resp._pb)
    text = resp.full_text_annotation.text
    words = []
    for page in raw.get('fullTextAnnotation', {}).get('pages', []):
        for block in page.get('blocks', []):
            for para in block.get('paragraphs', []):
                for word in para.get('words', []):
                    w = ''.join(sym.get('text', '') for sym in word.get('symbols', []))
                    verts = word.get('boundingBox', {}).get('vertices', [])
                    xs, ys = zip(*[(v.get('x', 0), v.get('y', 0)) for v in verts]) if verts else ([0], [0])
                    words.append({'text': w, 'x': mean(xs), 'y': mean(ys)})
    return raw, text, words


def group_lines_data(words, y_thresh=10):
    """Agrupa palavras em linhas baseado em proximidade vertical."""
    lines = []
    for w in sorted(words, key=lambda x: x['y']):
        placed = False
        for line in lines:
            if abs(line['y_mean'] - w['y']) <= y_thresh:
                line['words'].append(w)
                line['y_mean'] = mean([ww['y'] for ww in line['words']])
                placed = True
                break
        if not placed:
            lines.append({'y_mean': w['y'], 'words': [w]})
    return lines


def lines_data_to_text(lines_data):
    """Converte linhas agrupadas em lista de strings ordenadas por posição X."""
    return [' '.join(w['text'] for w in sorted(line['words'], key=lambda w: w['x']))
            for line in lines_data]


def parse_fields(text, lines_text):
    """Extrai data_emissao, valor_total, cnpj e nome_loja com fallback de próxima linha."""
    res = {'data_emissao': None, 'valor_total': None, 'cnpj': None, 'nome_loja': None}
    # Nome da loja
    m = re.search(r'Recebemos\s+de\s+(.+?)\s+OS PRODUTOS', text, re.IGNORECASE)
    if m:
        res['nome_loja'] = m.group(1).strip()
    # Data de emissão
    m = re.search(r'Data\s+emiss[ãa]o[:\-]?\s*(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})',
                  text, re.IGNORECASE)
    if not m:
        m = re.search(r'(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})', text)
    if m:
        res['data_emissao'] = m.group(1)
    # Valor total: rótulos e fallback
    labels = ['valor total da nota', 'valor total dos produtos', 'valor total dos serviços']
    for i, ln in enumerate(lines_text):
        low = ln.lower()
        if any(label in low for label in labels):
            nums = re.findall(r'(\d+[\d\.,]*\d*)', ln)
            if nums:
                res['valor_total'] = nums[-1]
            else:
                # fallback na próxima linha
                if i+1 < len(lines_text):
                    nums2 = re.findall(r'(\d+[\d\.,]*\d*)', lines_text[i+1])
                    if nums2:
                        res['valor_total'] = nums2[-1]
            break
    # CNPJ
    m = re.search(r'(\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})', text)
    if m:
        res['cnpj'] = m.group(1)
    return res


def extract_items(lines_data):
    """Extrai itens com descricao, quantidade e preco_total via divisão."""
    texts = lines_data_to_text(lines_data)
    idx = next((i for i, ln in enumerate(texts)
                if 'itens da nota fiscal' in ln.lower()), None)
    if idx is None:
        return []
    items = []
    for line in lines_data[idx+2:]:
        first = line['words'][0]['text'].lower() if line['words'] else ''
        if first.startswith('cálculo'):
            break
        words = sorted(line['words'], key=lambda w: w['x'])
        toks = [w['text'] for w in words]
        prices = [t for t in toks if re.match(r'^[\d\.]+,\d{2}$', t)]
        if len(prices) < 2:
            continue
        unit_str, total_str = prices[0], prices[1]
        try:
            u = float(unit_str.replace('.', '').replace(',', '.'))
            tval = float(total_str.replace('.', '').replace(',', '.'))
            quantidade = str(int(round(tval / u)))
        except:
            continue
        try:
            di = toks.index(unit_str)
            descricao = ' '.join(toks[:di])
        except:
            descricao = ' '.join(toks)
        items.append({'descricao': descricao,
                      'quantidade': quantidade,
                      'preco_total': total_str})
    return items


def append_to_sheet(fields, itens):
    """Anexa dados ao Google Sheets via OAuth2 da Service Account com debug."""
    try:
        creds.refresh(Request())
        token = creds.token
        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }
        row = [
            fields.get('data_emissao'),
            fields.get('valor_total'),
            fields.get('cnpj'),
            fields.get('nome_loja'),
            json.dumps(itens, ensure_ascii=False)
        ]
        body = {'values': [row]}
        print('DEBUG: POST', BASE_SHEETS_URL)
        print('DEBUG: Body', json.dumps(body, ensure_ascii=False))
        response = requests.post(BASE_SHEETS_URL,
                                 headers=headers, json=body)
        print('DEBUG: Status', response.status_code)
        print('DEBUG: Response', response.text)
        response.raise_for_status()
        
        # Parse and log the successful response
        if response.status_code == 200:
            result = response.json()
            print(f"SUCCESS: Data appended to sheet at {result.get('updates', {}).get('updatedRange', 'unknown')}")
            print(f"Updated {result.get('updates', {}).get('updatedRows', 0)} rows")
        
        return response.json()
    except Exception:
        print('ERROR appending to sheet:')
        print(traceback.format_exc())
        return None


@app.route('/health', methods=['GET'])
def health_check():
    """Endpoint para verificar se a API está online."""
    return jsonify({"status": "ok", "message": "API de extração de notas está funcionando!"})

@app.route('/scan', methods=['POST'])
def extract_endpoint():
    # time.sleep(10)
    try:
        print(f"Request received - Content-Type: {request.content_type}")
        print(f"Available files: {list(request.files.keys()) if request.files else 'None'}")
        print(f"Available form data: {list(request.form.keys()) if request.form else 'None'}")
        
        f = request.files.get('file')
        if not f:
            # Se não houver arquivo, verifica se há dados em base64
            if request.is_json:
                data = request.json
                if data and 'image' in data:
                    img = base64.b64decode(data['image'])
                else:
                    print("DEBUG: Nenhum arquivo enviado no JSON.")
                    return jsonify({
                        'success': False,
                        'error': 'No file provided in JSON',
                        'message': 'Por favor, forneça um arquivo para análise'
                    }), 400
            else:
                print(f"DEBUG: Nenhum arquivo enviado. Content-Type: {request.content_type}")
                return jsonify({
                    'success': False,
                    'error': f'No file provided. Content-Type: {request.content_type}',
                    'message': 'Por favor, forneça um arquivo para análise'
                }), 400
        else:
            img = f.read()
        
        # OCR e extração
        try:
            raw, text, words = ocr_document(img)
            lines = group_lines_data(words)
            texts = lines_data_to_text(lines)
            fields = parse_fields(text, texts)
            itens = extract_items(lines)
        except Exception as ocr_error:
            print("DEBUG: Falha no OCR ou extração:", ocr_error)
            traceback.print_exc()
            # Se falhar, ainda assim tenta enviar campos vazios
            fields = {'data_emissao': None, 'valor_total': None, 'cnpj': None, 'nome_loja': None}
            itens = []
        
        # Validação extra: se todos os campos estão vazios, loga
        if not any(fields.values()):
            print("DEBUG: Todos os campos extraídos estão vazios.")
        else:
            print(f"DEBUG: Campos extraídos: {fields}")
        print(f"DEBUG: Itens extraídos: {itens}")

        # Sempre tenta fazer o append na planilha, mesmo se campos estiverem vazios
        # try:
        #     # append_result = append_to_sheet(fields, itens)
        #     # sheet_updated = append_result is not None
        #     # print(f"DEBUG: Resultado do append: {append_result}")
        # except Exception as e:
        #     print(f"Erro ao atualizar planilha: {str(e)}")
        #     traceback.print_exc()
        #     sheet_updated = False
        
        return jsonify({
            'success': True,
            'fields': fields, 
            'itens': itens,
            # 'sheet_updated': sheet_updated
        })
    
    except Exception as e:
        print(f"Erro na extração: {str(e)}")
        traceback.print_exc()
        return jsonify({
            'success': False,
            'error': str(e),
            'message': 'Falha ao processar a imagem'
        }), 500
    
@app.route('/append', methods=['POST'])
def append_data():
    try:
        data = request.json
        fields = data.get('fields', {})
        itens = data.get('itens', [])
        result = append_to_sheet(fields, itens)
        return jsonify({"success": result is not None})
    except Exception as e:
        print(f"Erro ao enviar para planilha: {str(e)}")
        return jsonify({"success": False, "error": str(e)})


# --- IMPORTAÇÕES DO TESSERACT ---
import sys
sys.path.append(os.path.join(BASE_DIR))
from tesseract import processar_nota

@app.route('/scan_tesseract', methods=['POST'])
def scan_tesseract():
    try:
        f = request.files.get('file')
        if not f:
            if request.is_json:
                data = request.json
                if data and 'image' in data:
                    img_bytes = base64.b64decode(data['image'])
                    temp_path = os.path.join(BASE_DIR, 'temp_tesseract.png')
                    with open(temp_path, 'wb') as temp_img:
                        temp_img.write(img_bytes)
                    caminho_imagem = temp_path
                else:
                    return jsonify({'success': False, 'error': 'No file provided'}), 400
            else:
                return jsonify({'success': False, 'error': 'No file provided'}), 400
        else:
            temp_path = os.path.join(BASE_DIR, 'temp_tesseract.png')
            f.save(temp_path)
            caminho_imagem = temp_path

        campos = processar_nota(caminho_imagem)
        # Adapta para o mesmo formato do Google Vision
        fields = {
            'data_emissao': campos.get('data_emissao'),
            'cnpj': campos.get('cnpj'),
            'valor_total': None,  # Tesseract não extrai valor_total por padrão
            'nome_loja': None     # Tesseract não extrai nome_loja por padrão
        }
        itens = campos.get('descricao', [])
        return jsonify({'success': True, 'fields': fields, 'itens': itens})
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'success': False, 'error': str(e)}), 500


if __name__ == '__main__':
    # Em produção, use um servidor WSGI como gunicorn
    # Para desenvolvimento/teste, use:
    app.run(host='0.0.0.0', port=5000, debug=True)
