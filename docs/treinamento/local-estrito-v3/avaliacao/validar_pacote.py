"""Validação offline do pacote de especificação. Não testa o L30 Cut instalado."""
from __future__ import annotations
import copy
import hashlib
import json
import sqlite3
import tempfile
from datetime import datetime, timezone
from pathlib import Path
import sys

try:
    from jsonschema import Draft202012Validator, FormatChecker
except ImportError:
    raise SystemExit('jsonschema não está instalado neste ambiente. Use a dependência de desenvolvimento fornecida por pacote offline; este script não instala nem baixa nada.')

ROOT = Path(__file__).resolve().parents[1]
checks: list[dict[str, object]] = []
def check(name: str, fn) -> None:
    try:
        detail = fn()
        checks.append({'name': name, 'status': 'passed', 'detail': detail or 'OK'})
    except Exception as exc:
        checks.append({'name': name, 'status': 'failed', 'detail': f'{type(exc).__name__}: {exc}'})

def load(path: str):
    return json.loads((ROOT / path).read_text(encoding='utf-8'))

def utf8():
    paths=[p for p in ROOT.rglob('*') if p.is_file() and p.suffix in {'.txt','.md','.json','.jsonl','.py','.sql'}]
    for p in paths:
        s=p.read_text(encoding='utf-8')
        assert '\x00' not in s, p.name
        assert s.endswith('\n'), p.name
    return f'{len(paths)} arquivos textuais lidos como UTF-8.'

def syntax():
    n=0
    for p in ROOT.rglob('*.json'):
        json.loads(p.read_text(encoding='utf-8'));n+=1
    for p in ROOT.rglob('*.jsonl'):
        for line in p.read_text(encoding='utf-8').splitlines():
            json.loads(line);n+=1
    return f'{n} objetos JSON/JSONL válidos.'

def schemas():
    n=0
    for p in (ROOT/'contratos').glob('*.schema.json'):
        Draft202012Validator.check_schema(json.loads(p.read_text(encoding='utf-8')));n+=1
    return f'{n} schemas locais conferidos.'

def profile():
    p=load('06_PERFIL_TREINAMENTO.json')
    Draft202012Validator(load('contratos/perfil_espelho_fornecido.schema.json')).validate(p)
    assert len(p['rules'])==20
    assert max(map(len,p['rules']))<=240
    for item in p['knowledge']:
        assert item['bytes']==len(item['excerpt'].encode('utf-8'))
    return f'20 regras; maior regra: {max(map(len,p["rules"]))} caracteres; 8 resumos no espelho fornecido. Não houve importação no Cut.'

def policy():
    p=load('contratos/politica_local_proposta.json')
    for k in ['externalNetwork','lanAccess','webSearch','cloudFallback','autoDownload','autoUpdate','telemetry','remoteSync','onlineLoginRequired']:
        assert p[k] is False, k
    assert p['remoteProviders']==[]
    assert p['loopback']['allowedOrigins']==['http://127.0.0.1:11434']
    assert p['loopback']['allowRedirects'] is False
    assert p['loopback']['allowProxy'] is False
    assert p['provisioning']['modelCatalog']==[]
    assert p['status']=='proposed_not_installed'
    return 'Política declarativa coerente com local estrito; isso não demonstra aplicação no host.'

def examples():
    validator=Draft202012Validator(load('contratos/turno_assistente.schema.json'),format_checker=FormatChecker())
    for name in ['turno_pergunta.json','turno_bloqueado.json','turno_documento_concluido.json']:
        validator.validate(load('exemplos/'+name))
    Draft202012Validator(load('contratos/artefato.schema.json'),format_checker=FormatChecker()).validate(load('exemplos/artefato_demonstracao.json'))
    return 'Três turnos de exemplo e um anexo validados; IDs/recibo são sintéticos.'

def negative_question():
    v=Draft202012Validator(load('contratos/turno_assistente.schema.json'))
    bad=load('exemplos/turno_pergunta.json')
    bad['tasks']=[{'tool':'apply_edit_plan','inputs':{}}]
    assert not v.is_valid(bad)
    bad=load('exemplos/turno_pergunta.json');bad['questions']*=4
    assert not v.is_valid(bad)
    return 'Schema rejeita pergunta com tarefas e mais de três perguntas no turno.'

def negative_network():
    v=Draft202012Validator(load('contratos/turno_assistente.schema.json'))
    for tool in ['web_search','download_model','cloud_image']:
        bad={'schemaVersion':3,'status':'ready_for_tools','message':'teste','tasks':[{'tool':tool,'inputs':{}}]}
        assert not v.is_valid(bad),tool
    return 'O catálogo de exemplo não aceita ferramentas externas. Adaptadores reais ainda precisam aplicar a política.'

def bytes_check():
    a=load('exemplos/artefato_demonstracao.json')
    b=(ROOT/'exemplos'/a['fileName']).read_bytes()
    assert len(b)==a['byteSize']
    assert hashlib.sha256(b).hexdigest()==a['sha256']
    assert b.decode('utf-8').startswith('ROTEIRO DE DEMONSTRAÇÃO')
    return f'TXT real incluído: {len(b)} bytes, SHA-256 coerente com o exemplo.'

def datasets():
    q=load('dados/BANCO_DE_PERGUNTAS.json')['questions']
    assert len(q)==36 and len({x['id'] for x in q})==36
    assert all(x['mutate_before_answer'] is False for x in q)
    train=[json.loads(x) for x in (ROOT/'dados/TREINO_CENARIOS.jsonl').read_text().splitlines()]
    test=[json.loads(x) for x in (ROOT/'dados/TESTE_RESERVADO.jsonl').read_text().splitlines()]
    assert len(train)==30 and len(test)==12
    assert {x['id'] for x in train}.isdisjoint({x['id'] for x in test})
    assert all(x['synthetic'] for x in train+test)
    return '36 perguntas, 30 cenários de treino e 12 reservados; nenhum modelo foi avaliado.'

def sql_roundtrip():
    with tempfile.TemporaryDirectory() as temp:
        path=Path(temp)/'spec_fixture.sqlite3'
        c=sqlite3.connect(path)
        c.executescript((ROOT/'contratos/persistencia_proposta.sql').read_text())
        c.execute('INSERT INTO projects VALUES (?,?)',('w','p'))
        c.execute('INSERT INTO projects VALUES (?,?)',('w','other'))
        c.execute('INSERT INTO conversations VALUES (?,?,?,?,?)',('w','p','c','Conversa','2026-09-04'))
        c.execute('INSERT INTO conversations VALUES (?,?,?,?,?)',('w','other','c2','Outra','2026-09-04'))
        c.execute('INSERT INTO messages VALUES (?,?,?,?,?,?,?)',('w','p','c','m','assistant','Roteiro','2026-09-04'))
        c.execute('INSERT INTO messages VALUES (?,?,?,?,?,?,?)',('w','other','c2','m2','assistant','Outro','2026-09-04'))
        c.execute('INSERT INTO documents VALUES (?,?,?,?)',('w','p','d','Roteiro'))
        fields=['workspace_id','project_id','artifact_id','document_id','source_conversation_id','source_message_id','version','previous_artifact_id','file_name','storage_key','mime_type','encoding','byte_size','sha256','state','idempotency_key','created_at']
        sql='INSERT INTO artifacts ('+','.join(fields)+') VALUES ('+','.join('?' for _ in fields)+')'
        values=['w','p','a1','d','c','m',1,None,'roteiro_v01.txt','w/p/a1/content.txt','text/plain','utf-8',10,'a'*64,'ready','key1','2026-09-04']
        c.execute(sql,values)
        c.execute('INSERT INTO message_artifacts VALUES (?,?,?,?,?,?)',('w','p','c','m','a1',0))
        c.commit()
        v2=list(values);v2[2]='a2';v2[6]=2;v2[7]='a1';v2[8]='roteiro_v02.txt';v2[9]='w/p/a2/content.txt';v2[15]='key2'
        c.execute(sql,v2);c.commit()
        bad=list(v2);bad[2]='a3';bad[9]='w/p/a3/content.txt';bad[15]='key3'
        try:
            c.execute(sql,bad)
        except sqlite3.IntegrityError:
            c.rollback()
        else:
            raise AssertionError('Versão duplicada foi aceita.')
        try:
            c.execute('INSERT INTO message_artifacts VALUES (?,?,?,?,?,?)',('w','other','c2','m2','a1',0))
        except sqlite3.IntegrityError:
            c.rollback()
        else:
            raise AssertionError('Vínculo de outro projeto foi aceito.')
        c.close()
        c=sqlite3.connect(path)
        assert c.execute('SELECT COUNT(*) FROM artifacts').fetchone()[0]==2
        assert c.execute('SELECT previous_artifact_id FROM artifacts WHERE artifact_id=?',('a2',)).fetchone()[0]=='a1'
        assert c.execute('SELECT COUNT(*) FROM message_artifacts').fetchone()[0]==1
        c.close()
    return 'Modelo SQLite em banco temporário: reabertura, versões, duplicidade rejeitada e isolamento de vínculos. Não é teste da persistência do Cut.'

def provenance():
    e=load('fontes/EVIDENCIAS_CODIGO.json')
    assert e['installed_build_verified'] is False and e['network_capture_performed'] is False
    assert len(e['files'])==8 and len({x['id'] for x in e['files']})==8
    assert e['ref']=='b60ad7d0bb861a4258ad46396e9527cffa34d39b'
    return 'Oito arquivos referenciados com commit e limites da inspeção.'

def hashes():
    p=ROOT/'MANIFESTO_PACOTE.json'
    if not p.exists(): raise AssertionError('Manifesto do pacote ausente.')
    m=load('MANIFESTO_PACOTE.json')
    for f in m['files']:
        p=ROOT/f['path']
        assert p.is_file(),f['path']
        assert hashlib.sha256(p.read_bytes()).hexdigest()==f['sha256'],f['path']
    return f'{len(m["files"])} hashes verificados; manifesto e relatório excluídos da autoassinatura.'

for name,fn in [('utf8',utf8),('json_syntax',syntax),('schemas',schemas),('profile_limits',profile),('local_policy',policy),('examples',examples),('questions_no_mutations',negative_question),('external_tools_rejected',negative_network),('txt_integrity',bytes_check),('synthetic_datasets',datasets),('sql_model_roundtrip',sql_roundtrip),('provenance_scope',provenance),('package_hashes',hashes)]:
    check(name,fn)
report={'created_at':datetime.now(timezone.utc).isoformat(),'scope':'package_static_and_sql_fixture_only','installed_application_tested':False,'llm_tested':False,'voice_tested':False,'network_isolation_tested':False,'passed':sum(x['status']=='passed' for x in checks),'failed':sum(x['status']=='failed' for x in checks),'checks':checks}
(ROOT/'avaliacao/RELATORIO_VALIDACAO.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps(report,ensure_ascii=False,indent=2))
sys.exit(1 if report['failed'] else 0)
