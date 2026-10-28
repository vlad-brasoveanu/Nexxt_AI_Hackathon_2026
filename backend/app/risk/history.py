"""Read-only SQLite adapter. Matching never uses outcomes, flags or retrospective narratives."""
import hashlib
import math
import sqlite3
from functools import lru_cache
from pathlib import Path
from statistics import pstdev
from collections import Counter

DEFAULT_PATH = Path(__file__).resolve().parents[3] / 'fixtures/credit/history/historical_cases.db'
SECTORS = {'01':'Agricultură','10':'Producție alimentară','25':'Producție metalurgică','41':'Construcții',
           '46':'Comerț cu ridicata','47':'Retail alimentar','49':'Transport rutier de mărfuri','56':'HoReCa',
           '62':'IT și servicii','70':'Servicii profesionale'}
PRODUCTS = {'Credit de investiții IMM':'Credit de investiții','Credit de investiții':'Credit de investiții',
            'Credit imobiliar comercial':'Credit imobiliar comercial','Leasing echipamente':'Leasing echipamente',
            'Linie de capital circulant':'Linie de capital circulant'}
FEATURES = ('ebitda_margin_pct','current_ratio','revenue_growth_pct','years_in_business','employees')
NOTE = 'Istoric sintetic în EUR, credite 2012–2022. Rezultate descriptive cu durate diferite de observație; nu reprezintă probabilitatea de insolvență a solicitantului.'


def finite(x):
    return isinstance(x, (float, int)) and math.isfinite(x)


def load(path=None):
    p=Path(path or DEFAULT_PATH).resolve()
    stat=p.stat()
    return _load(str(p), stat.st_mtime_ns, stat.st_size)


@lru_cache(maxsize=4)
def _load(path, mtime, size):
    digest=hashlib.sha256(Path(path).read_bytes()).hexdigest()
    with sqlite3.connect(Path(path).as_uri()+'?mode=ro', uri=True) as db:
        db.execute('PRAGMA query_only=ON')
        db.execute('PRAGMA trusted_schema=OFF')
        db.row_factory=sqlite3.Row
        if db.execute('PRAGMA quick_check').fetchone()[0]!='ok':
            raise ValueError('Historical database integrity check failed')
        required={'companies':{'company_id','country','sector','caen','founded_year','employees'},
                  'credits':{'case_id','company_id','product','amount_eur','term_months','approved_year'},
                  'financials':{'case_id','fy_offset','fiscal_year','turnover','ebitda','current_assets','current_liabilities'},
                  'outcomes':{'case_id','outcome','months_to_event'}}
        for table, columns in required.items():
            actual={r[1] for r in db.execute(f'PRAGMA table_info({table})')}
            if not columns <= actual:
                raise ValueError(f'Historical schema mismatch: {table}')
        total=db.execute('select count(*) from credits').fetchone()[0]
        orphan=db.execute('''select count(*) from credits c left join companies p using(company_id)
            left join outcomes o using(case_id) where p.company_id is null or o.case_id is null''').fetchone()[0]
        if orphan:
            raise ValueError('Historical records have missing company/outcome references')
        rows=[dict(r) for r in db.execute('''select c.case_id,c.product,c.amount_eur,c.term_months,c.approved_year,
          p.country,p.sector,p.caen,p.founded_year,p.employees,
          f.fiscal_year,f.turnover,f.ebitda,f.current_assets,f.current_liabilities,
          prev.turnover previous_turnover,prev.fiscal_year previous_year,
          o.outcome,o.months_to_event
          from credits c join companies p using(company_id)
          join financials f on f.case_id=c.case_id and f.fy_offset=-1
          join financials prev on prev.case_id=c.case_id and prev.fy_offset=-2
          join outcomes o on o.case_id=c.case_id order by c.case_id''')]
    valid=[]; excluded=total-len(rows)
    for r in rows:
        keys=('turnover','ebitda','current_assets','current_liabilities','previous_turnover','amount_eur','employees','founded_year','approved_year')
        if (not all(finite(r[k]) for k in keys) or min(r['turnover'],r['previous_turnover'],r['current_liabilities'],r['amount_eur'])<=0
            or not r['previous_year'] < r['fiscal_year'] < r['approved_year'] or r['founded_year']>r['approved_year']
            or r['outcome'] not in {'CLOSED_OK','INSOLVENCY','LATE_RECOVERED','NPL_DEFAULT','RESTRUCTURED'}):
            excluded+=1;continue
        features={'ebitda_margin_pct':100*r['ebitda']/r['turnover'], 'current_ratio':r['current_assets']/r['current_liabilities'],
                  'revenue_growth_pct':100*(r['turnover']/r['previous_turnover']-1),
                  'years_in_business':r['approved_year']-r['founded_year'],'employees':r['employees']}
        valid.append({**r,'features':features})
    return {'id':'historical-cases-eur-v1','sha256':digest,'synthetic':True,'currency':'EUR','total':total,
            'valid':len(valid),'excluded':excluded,'romania':sum(r['country']=='RO' for r in valid),'rows':tuple(valid)}


def compare(dataset, caen, product, applicant):
    sector=SECTORS.get(str(caen)[:2]); product=PRODUCTS.get(product)
    keys=[k for k in FEATURES if finite(applicant.get(k))]
    pool=[r for r in dataset['rows'] if sector and product and r['country']=='RO' and r['sector']==sector and r['product']==product]
    result={'dataset':{k:v for k,v in dataset.items() if k!='rows'},'sector':sector,'product':product,'country':'RO',
            'currency':'EUR','matching_features':keys,'applicant':{k:applicant[k] for k in keys},'cohort_size':len(pool),
            'n':0,'limited':True,'comparables':[],'outcomes':[],'note':NOTE,'method':'standardized_distance_v1'}
    if len(keys)<3 or not {'ebitda_margin_pct','current_ratio'} <= set(keys):
        result['limitation']='Sunt necesari marja EBITDA, lichiditatea și cel puțin un indicator suplimentar.'
        return result
    if not pool:
        result['limitation']='Nu există comparabile RO pentru sectorul și produsul selectate; nu extindem automat căutarea.'
        return result
    scales={k:pstdev(r['features'][k] for r in pool) for k in keys}
    usable=[k for k in keys if scales[k]>0]
    if not usable:
        result['limitation']='Indicatorii istorici nu permit diferențierea cazurilor.'
        return result
    ranked=sorted(((math.sqrt(sum(((applicant[k]-r['features'][k])/scales[k])**2 for k in usable)/len(usable)),r) for r in pool),
                  key=lambda pair:(pair[0],pair[1]['case_id']))[:30]
    result.update(n=len(ranked),limited=len(ranked)<30)
    result['limitation']='Eșantion sub 30 de cazuri.' if len(ranked)<30 else 'Comparație descriptivă pe un istoric vechi și sintetic; fără validare predictivă.'
    result['comparables']=[{'case_id':r['case_id'],'year':r['approved_year'],'country':r['country'],'sector':r['sector'],
        'product':r['product'],'amount':r['amount_eur'],'currency':'EUR','term_months':r['term_months'],
        'distance':round(d,4),'features':{k:round(r['features'][k],4) for k in keys},
        'differences':{k:round(r['features'][k]-applicant[k],4) for k in keys},
        'outcome':r['outcome'],'months_to_event':r['months_to_event'],
        'source':{'dataset_sha256':dataset['sha256'],'case_id':r['case_id'],'financial_offsets':[-2,-1]}} for d,r in ranked[:5]]
    counts=Counter(r['outcome'] for _,r in ranked)
    result['outcomes']=[{'outcome':key,'count':n,'share_pct':round(100*n/len(ranked),1)} for key,n in sorted(counts.items())]
    return result


def applicant_from_board(board):
    values={k:m['value'] for k,m in board['metrics'].items() if k in FEATURES}
    latest=(board.get('financials') or {}).get('latest')
    f=board['facts'].get(f'fs{latest}-employees')
    if f and f['review']!='rejected':
        values['employees']=f.get('corrected_value') if f['review']=='corrected' else f.get('normalized')
    return values
