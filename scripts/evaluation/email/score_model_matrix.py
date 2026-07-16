#!/usr/bin/env python3
"""Convert local raw Foundry results into a committed-safe aggregate report."""
from __future__ import annotations
import argparse, json
from collections import defaultdict
from pathlib import Path
from typing import Any
SCRIPT_DIR=Path(__file__).resolve().parent
def read_jsonl(path:Path)->list[dict[str,Any]]: return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x]
def label(record:dict[str,Any])->tuple[str|None,str|None]:
 try:
  content=record['response']['choices'][0]['message']['content']; parsed=json.loads(content); return parsed.get('category'),parsed.get('subtype')
 except (KeyError,IndexError,TypeError,json.JSONDecodeError): return None,None
def main()->int:
 p=argparse.ArgumentParser();p.add_argument('--results',type=Path,default=SCRIPT_DIR/'local'/'matrix-results.local.jsonl');p.add_argument('--inputs',type=Path,default=SCRIPT_DIR/'local'/'parsefed-inputs.local.jsonl');p.add_argument('--out',type=Path,required=True);a=p.parse_args()
 if not a.results.exists():
  print(f'No local result file exists at {a.results}; there is nothing to score.')
  return 0
 expected={x['id']:x['expected'] for x in read_jsonl(a.inputs)}; buckets:dict[str,list[dict[str,Any]]]=defaultdict(list)
 seen:set[tuple[str,str]]=set()
 for row in read_jsonl(a.results):
  key=(str(row.get('model_id')),str(row.get('id')))
  if not row.get('request_hash') or key in seen: continue
  seen.add(key); buckets[row['model_id']].append(row)
 models={}
 for model,rows in buckets.items():
  safe=[]; exact=category=valid=0
  for row in rows:
   if row['id'] not in expected: continue
   got_cat,got_sub=label(row); exp=expected[row['id']]; ok=got_cat is not None and got_sub is not None; valid+=ok; category+=ok and got_cat==exp.get('category'); exact+=ok and got_cat==exp.get('category') and got_sub==exp.get('subtype')
   safe.append({'id':row['id'],'expected':exp,'got':{'category':got_cat,'subtype':got_sub} if ok else None,'status':row.get('status'),'latency_ms':row.get('latency_ms'),'valid':ok})
  models[model]={'calls':len(rows),'valid_outputs':valid,'category_accuracy':category/len(rows) if rows else 0,'exact_accuracy':exact/len(rows) if rows else 0,'items':safe}
 a.out.write_text(json.dumps({'schema_version':1,'models':models},indent=2)+'\n',encoding='utf-8')
 print(f'Wrote PII-safe aggregate for {len(models)} model(s) to {a.out}.');return 0
if __name__=='__main__':raise SystemExit(main())
