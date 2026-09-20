import json
from dataclasses import replace
from types import SimpleNamespace
import pytest
from test_openrouter_production import settings
from test_openrouter_research import research_pin,research_response
from test_generation_runtime import _payload


def test_qualification_harness_is_dry_by_default_and_never_replays(settings,tmp_path,monkeypatch):
    from auditlayer_worker.qualify_research import qualify
    monkeypatch.setenv('ALM_OPENROUTER_API_KEY','offline')
    settings=replace(settings,generator='hermes',token_cap=1398976,cost_cap_usd=1)
    candidate=dict(pin=research_pin(),handle='example',platform='instagram',goal='growth')
    dispatches=[]
    def complete(*args):
        request=args[1]
        dispatches.append(request.research)
        # Pre-dispatch receipt must already be on disk.
        files=list((tmp_path/'run').glob('receipt-*.json'))
        assert files and json.loads(sorted(files)[-1].read_text())[-1]['status']=='reserved'
        raw=research_response() if request.research else dict(model=settings.hermes_model,id='report',
            choices=[dict(finish_reason='stop',message=dict(content=_payload()))],
            usage=dict(prompt_tokens=100,completion_tokens=50,cost=.00002))
        return {'raw':raw}
    monkeypatch.setattr('auditlayer_worker.openrouter.one_call',complete)
    dry=qualify(settings,candidate,tmp_path/'run')
    assert dry['status']=='dry_run' and not dispatches and not (tmp_path/'run').exists()
    result=qualify(settings,candidate,tmp_path/'run',execute=True)
    assert result['status']=='candidate_pass',result
    assert dispatches==[True,False]
    assert result['settlement_preview']['customer_debit_microusd']==21821
    assert json.loads((tmp_path/'run/result.json').read_text())==result
    with pytest.raises(FileExistsError): qualify(settings,candidate,tmp_path/'run',execute=True)
    assert dispatches==[True,False]
