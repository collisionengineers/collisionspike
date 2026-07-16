#!/usr/bin/env python3
"""Foundry matrix runner. Dry-run is the default; billed calls need explicit consent."""
from __future__ import annotations
import argparse, hashlib, json, os, random, shutil, subprocess, time, urllib.error, urllib.request
from pathlib import Path
from typing import Any
SCRIPT_DIR=Path(__file__).resolve().parent

def load_jsonl(path: Path) -> list[dict[str,Any]]: return [json.loads(x) for x in path.read_text(encoding='utf-8').splitlines() if x]
def output_schema(categories:list[str],subtypes:list[str])->dict[str,Any]: return {'type':'object','properties':{'category':{'type':'string','enum':categories},'subtype':{'type':'string','enum':subtypes},'confidence':{'type':'number','minimum':0,'maximum':1}},'required':['category','subtype','confidence'],'additionalProperties':False}
def request_hash(row:dict[str,Any],model:dict[str,Any],prompt:str)->str: return hashlib.sha256(json.dumps([row['id'],row['content_hash'],model['id'],model['version'],prompt],sort_keys=True).encode()).hexdigest()
def token()->str:
 cli=os.environ.get('AZ_CLI_PATH') or shutil.which('az') or shutil.which('az.cmd') or 'az'
 p=subprocess.run([cli,'account','get-access-token','--resource','https://cognitiveservices.azure.com','--query','accessToken','-o','tsv'],text=True,capture_output=True,timeout=30)
 if p.returncode or not p.stdout.strip(): raise RuntimeError('Could not obtain an Azure CLI cognitive-services token.')
 return p.stdout.strip()
def main()->int:
 p=argparse.ArgumentParser();p.add_argument('--inputs',type=Path,default=SCRIPT_DIR/'local'/'parsefed-inputs.local.jsonl');p.add_argument('--results',type=Path,default=SCRIPT_DIR/'local'/'matrix-results.local.jsonl');p.add_argument('--probe',action='store_true');p.add_argument('--only-id');p.add_argument('--only-model');p.add_argument('--confirm-billed-run',action='store_true');p.add_argument('--seed',type=int,default=20260714);a=p.parse_args()
 matrix=json.loads((SCRIPT_DIR/'model-matrix.json').read_text()); prompt=(SCRIPT_DIR/'model-eval-prompt.md').read_text(); rows=load_jsonl(a.inputs); rows=[r for r in rows if not a.only_id or r['id']==a.only_id]; models=[m for m in matrix['models'] if m.get('deployment') and (not a.only_model or m['id']==a.only_model)]
 if not models:
  print(f"PRE-FLIGHT REQUIRED: {len(matrix['models'])} candidates are listed but no deployment is pinned. No request was made.")
  return 0
 if a.probe:
  synthetic={'id':'__contract_probe__','content_hash':'synthetic-v1','expected':{'category':'query','subtype':'query_existing_work'},'input':{'message':{'sender_domain':'example.test','subject':'Status question','body':'Please confirm the status of work already in progress.','in_reply_to':'','references':'','provider_match_state':'none','open_case_ref_match':'none','attachments':[]},'documents':[],'truncation':{'message_body':False,'max_chars':0}}}
  work=[(m,synthetic) for m in models]
 else:
  work=[(m,r) for m in models for r in rows]
 random.Random(a.seed).shuffle(work)
 # A completed first attempt is immutable evidence. Resume only missing request
 # hashes, never repeat a paid call after an interrupted local process.
 completed=set()
 if a.results.exists():
  for line in a.results.read_text(encoding='utf-8').splitlines():
   try: completed.add(json.loads(line).get('request_hash'))
   except json.JSONDecodeError: pass
 work=[(m,r) for m,r in work if request_hash(r,m,prompt) not in completed]
 if not a.confirm_billed_run:
  print(f'DRY RUN: {len(work)} planned calls across {len(models)} pinned deployments. Add --confirm-billed-run after the cost/privacy preflight.'); return 0
 endpoint=os.environ.get(matrix['endpoint_env']);
 if not endpoint: raise SystemExit(f"Set {matrix['endpoint_env']} to the Foundry endpoint.")
 auth=token(); a.results.parent.mkdir(parents=True,exist_ok=True); categories=sorted({x['expected']['category'] for x in rows}); subtypes=sorted({x['expected']['subtype'] for x in rows})
 with a.results.open('a',encoding='utf-8') as f:
  for model,row in work:
   body={'model':model['deployment'],'messages':[{'role':'system','content':prompt},{'role':'user','content':json.dumps(row['input'],separators=(',',':'))}],'response_format':{'type':'json_schema','json_schema':{'name':'email_classification','strict':True,'schema':output_schema(categories,subtypes)}},'max_completion_tokens':128}
   started=time.monotonic(); record={'id':row['id'],'model_id':model['id'],'request_hash':request_hash(row,model,prompt),'first_attempt':True}
   try:
    req=urllib.request.Request(endpoint.rstrip('/')+'/openai/v1/chat/completions',data=json.dumps(body).encode(),headers={'Authorization':'Bearer '+auth,'Content-Type':'application/json'},method='POST')
    with urllib.request.urlopen(req,timeout=matrix['default_timeout_seconds']) as resp: raw=json.loads(resp.read()); record.update({'status':resp.status,'latency_ms':round((time.monotonic()-started)*1000),'model_returned':raw.get('model'),'usage':raw.get('usage',{}),'response':raw})
   except urllib.error.HTTPError as exc: record.update({'status':exc.code,'latency_ms':round((time.monotonic()-started)*1000),'error':'http'})
   except Exception as exc: record.update({'status':None,'latency_ms':round((time.monotonic()-started)*1000),'error':type(exc).__name__})
   f.write(json.dumps(record,separators=(',',':'))+'\n'); f.flush()
 return 0
if __name__=='__main__': raise SystemExit(main())
