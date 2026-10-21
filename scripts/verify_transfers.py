"""Read-only live oracle, native runtimes, and optional actual browser returns."""
import json, subprocess, sys
from pathlib import Path
from transfer_oracle import oracle, verify_returns, ROOT

def verify(browser=None):
    expected=oracle()
    assert expected == json.loads((ROOT/'test/fixtures/transfers.json').read_text()), 'Transfer fixtures differ from live Python'
    for runtime in ('node','bun'):
        returns=json.loads(subprocess.check_output([runtime,str(ROOT/'scripts/render_transfers.js')],cwd=ROOT,text=True))
        verify_returns(returns)
        print(f'{runtime}: source, records and return verified against live Python')
    if browser:
        returns=json.loads(Path(browser).read_text())
        assert sorted(r['name'] for r in returns)==sorted(c['name'] for c in expected), 'Incomplete browser return corpus'
        verify_returns(returns)
        print('Browser WASM/IndexedDB: actual returned bundles imported and verified by Python')

if __name__=='__main__': verify(sys.argv[2] if len(sys.argv)>2 and sys.argv[1]=='--browser' else None)
