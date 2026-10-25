"""Exercise the single HTML in real Safari 27+ via its built-in MCP server.

Run after npm run build:file. Requires Safari remote automation enabled.
Closes/reopens the app tab within one automation session, not the Safari process.
MCP has no file picker API: injects fixture bytes into the real file input.
Captures the actual download Blob; Python verifies it separately.
"""
import json,subprocess,time,pathlib,queue,threading,re
ROOT=pathlib.Path(__file__).resolve().parents[1]
p=subprocess.Popen(['/usr/bin/safaridriver','--mcp'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.DEVNULL,text=True)
q=queue.Queue()
def reader():
    for line in p.stdout:
        try:q.put(json.loads(line))
        except ValueError:q.put({'invalid':line[:200]})
threading.Thread(target=reader,daemon=True).start()
sequence=0

def rpc(method,params):
    global sequence
    sequence+=1
    p.stdin.write(json.dumps({'jsonrpc':'2.0','id':sequence,'method':method,'params':params})+'\n');p.stdin.flush()
    while True:
        reply=q.get(timeout=65)
        if reply.get('id')!=sequence:continue
        if 'error' in reply:raise RuntimeError(reply['error'])
        return reply['result']
def tool(name,**args):
    result=rpc('tools/call',{'name':name,'arguments':args})
    if result.get('isError'):raise RuntimeError(result)
    text=''.join(c.get('text','') for c in result.get('content',[]))
    try:return json.loads(text)
    except ValueError:return text

def js(expression):return tool('evaluate_javascript',expression=expression)
def wait(expression,timeout=40):
    end=time.monotonic()+timeout
    while time.monotonic()<end:
        value=js(expression)
        if value:return value
        time.sleep(.3)
    raise RuntimeError('Timeout '+expression)
def status(expected):
    wait('return !window.gramlot.data.getItem("busy")')
    actual=js('return window.gramlot.data.getItem("transferStatus")')
    assert expected in actual,actual
    print(actual,flush=True)
def ready():wait('return window.gramlot?.data.getItem("ready")===true')
def click(selector):js('document.querySelector('+json.dumps(selector)+').click(); return true;')
def compare(expected):
    actual=js('return JSON.parse(window.gramlot.data.getItem("transferSample"))')
    for key in ['model','migration','structure','rows']:
        if actual[key]!=expected[key]:
            (ROOT/'output/safari-mismatch.json').write_text(json.dumps({'actual':actual,'expected':expected}))
            raise AssertionError('Mismatch: '+key)
    return actual

rpc('initialize',{'protocolVersion':'2024-11-05','capabilities':{},'clientInfo':{'name':'asqueel-file-test','version':'1'}})
p.stdin.write(json.dumps({'jsonrpc':'2.0','method':'notifications/initialized'})+'\n');p.stdin.flush()
try:
    url=(ROOT/'output/asqueel-offline.html').as_uri()
    tab=tool('create_tab',url=url)['handle'];ready()
    print('Safari started:',js('return navigator.userAgent'),flush=True)
    entry=next(e for e in json.loads((ROOT/'test/fixtures/transfers.json').read_text()) if e['name']=='tables')
    content=tool('get_page_content',region='entire_page')['content']
    editor=re.search(r'textarea uid=(\d+)',content).group(1)
    execute=re.search(r"button uid=(\d+) 'Esegui sul database locale'",content).group(1)
    bundle=json.dumps(entry['bundle'])
    # Safari MCP lacks file-upload. Supply the real Python file bytes to the normal input.
    js('const dt=new DataTransfer();dt.items.add(new File(['+json.dumps(bundle)+'],"python-snapshot.json",{type:"application/json"}));const input=document.querySelector("#transfer-file");input.files=dt.files;input.dispatchEvent(new Event("change",{bubbles:true}));return input.files[0].size;')
    click('#transfer-load');status('Snapshot caricato');compare(entry['before']);print('Initial full model, migration, SQLite catalog and values match Python',flush=True)
    requests=[
      {'operation':'update','table':'work.document','values':{'id':'d1','title':'Changed offline'}},
      {'operation':'insert','table':'work.line','values':{'id':'l2','document_id':'d1','description':'Nuova riga offline','quantity':3}},
      {'operation':'insert','table':'work.line','values':{'id':'temporary','document_id':'d1','quantity':1}},
      {'operation':'delete','table':'work.line','values':{'id':'temporary'}},
      {'operation':'select','table':'work.document','columns':'$id,$title','order_by':'$id'}]
    for request in requests:
        print('Running',request['operation'],request.get('values',{}).get('id'),flush=True)
        tool('page_interactions',interactions=[
            {'type':'type','node':editor,'value':json.dumps(request),'replaceAll':True,'purpose':'Set model query'},
            {'type':'keyPress','node':editor,'value':'Tab','purpose':'Commit editor value'},
            {'type':'click','node':execute,'purpose':'Execute query in SQLite'}])
        status(request['operation'].upper()+' completato')
    compare(entry['after']);print('CRUD matches Python',flush=True)
    spare=tool('create_tab',url='about:blank')['handle']
    tool('close_tab',handle=tab)
    tool('navigate_to_url',url=url,tab_uuid=spare);ready();status('Workspace ripristinato');compare(entry['after'])
    print('App tab closed and reopened: all comparisons pass',flush=True)
    js('const original=URL.createObjectURL;URL.createObjectURL=function(blob){if(blob.type==="application/json")blob.text().then(text=>window.__safariExport=text);return original.call(this,blob)};return true;')
    click('#transfer-export');status('Snapshot TYTX esportato')
    exported=wait('return window.__safariExport')
    (ROOT/'output/safari-transfer-returns.json').write_text(json.dumps([{'name':'tables','bundle':json.loads(exported)}]))
    print('Actual export Blob saved for Python verification',flush=True)
    logs=tool('browser_console_messages',level_filter=['error']);print('Console errors:',logs,flush=True)
    assert logs == [], logs
    network=tool('list_network_requests')
    (ROOT/'output/safari-network.json').write_text(json.dumps(network,indent=2))
    (ROOT/'output/safari-console.json').write_text(json.dumps(logs,indent=2))
    tool('screenshot',savePath=str(ROOT/'output/gramlot-safari-file.png'))
finally:
    p.terminate()
    try:p.wait(timeout=5)
    except subprocess.TimeoutExpired:p.kill()
