import cv2
import pytesseract
from PIL import Image
import re
from datetime import datetime

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
    # print("\n----- TEXTO OCR -----\n")
    # print(texto)
    # print("\n----------------------\n")
    campos = extrair_campos(texto)
    return campos

if __name__ == "__main__":
    resultado = processar_nota("teste1.png")
    print(resultado)