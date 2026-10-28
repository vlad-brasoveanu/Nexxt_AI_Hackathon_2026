"""Conservative checks for the supported demo templates, before financial extraction."""
import re
from app.agents import board as B
from app.credit.numbers import parse_ro

MARKERS = {
    'credit_application': 'Cerere de finanțare', 'financial_statements': 'Situații financiare anuale',
    'company_extract': 'CERTIFICAT CONSTATATOR', 'identity': 'CARTE DE IDENTITATE',
    'ownership': 'beneficiar', 'articles': 'ACT CONSTITUTIV', 'collateral_valuation': 'Raport',
}
CUI = re.compile(r'(?:Cod\s+unic\s+de\s+înregistrare(?:\s*\(CUI\))?|\bCUI)\s*:?\s*(?:RO\s*)?(\d{6,10})', re.I)


def inspect(doc, meta):
    text = ' '.join(' '.join(doc.pages).split())
    errors = []
    marker = MARKERS.get(doc.kind)
    if marker and marker.lower() not in text.lower():
        errors.append('Conținutul nu confirmă tipul declarat al documentului.')
    if doc.kind in {'financial_statements', 'credit_application', 'company_extract', 'articles', 'ownership'}:
        found = CUI.search(text)
        if not found or found[1] != meta.get('cui'):
            errors.append('CUI lipsă sau diferit de cererea înregistrată.')
        company = ' '.join(meta.get('company', '').split()).casefold()
        if company and company not in text.casefold():
            errors.append('Denumirea societății nu corespunde cererii.')
    if doc.kind in {'financial_statements', 'credit_application', 'collateral_valuation'}:
        if not re.search(r'\b(?:RON|lei)\b', text, re.I) or re.search(r'\b(?:EUR|EURO|USD|mii\s+(?:de\s+)?(?:lei|RON))\b', text, re.I):
            errors.append('Moneda/unitatea nu este confirmată ca RON; conversia necesită verificare manuală.')
    if doc.kind == 'financial_statements':
        years = set(re.findall(r'(?:anuale|Exercițiul)\s+(20\d\d)', text))
        if len(years) != 1:
            errors.append('Exercițiu financiar lipsă sau ambiguu.')
    if doc.kind == 'credit_application':
        caen = re.search(r'\(CAEN\)\s*(\d{4})',text,re.I)
        if not caen or caen[1]!=meta.get('caen'):
            errors.append('Codul CAEN din cerere nu corespunde documentului.')
        product = re.search(r'Produs\s+(.+?)\s+Suma solicitată',text,re.I)
        if not product or product[1].casefold()!=meta.get('product','').casefold():
            errors.append('Produsul din cerere nu corespunde documentului.')
        for key, pattern in [('amount', r'Suma solicitată\s+([\d.,]+)\s+RON'), ('term_months', r'Durata\s+(\d+)\s+luni')]:
            found = re.search(pattern, text, re.I)
            if not found or parse_ro(found[1]) != meta.get(key):
                errors.append(f'Valoarea {key} din cerere nu corespunde documentului.')
    return errors


def check(board, env):
    for doc in env.docs:
        if doc.media_type != 'application/pdf':
            continue
        errors = inspect(doc, env.case['meta'])
        key = f'document:{doc.id}'
        if errors:
            B.issue(board, key, 'completeness', 'blocking', f'Document de verificat: {doc.filename}', ' '.join(errors),
                    [doc.id], client_action=f'Document corectat: {doc.filename}')
        else:
            B.resolve(board, key, 'Conținut verificat pentru șablonul acceptat.')
