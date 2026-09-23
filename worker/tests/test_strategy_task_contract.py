"""Offline generator regressions for facts smuggled into creative directions."""
import json
import pytest
from test_factual_repair import connected_case
from product_strategy_fixtures import strategy_form
from test_generation_runtime import _Client, _generator
from auditlayer_worker.openrouter import MODEL
from auditlayer_worker.generation import GenerationStageError

ADVERSE = [
    'Show that your videos earn twice as many comments as carousels.',
    'Show your engagement rating of ninety out of ninety nine.',
    'Show how your audience prefers videos over every other format.',
    'Film a recap highlighting reels generating double the responses of image posts.',
    'Draft a caption celebrating an engagement rating of eighty seven.',
    'Create a storyboard explaining why followers favor video over static posts.',
    'Show the superior comment performance of videos compared with carousels.',
    'Feature videos as the most successful format for audience interaction.',
    'Write a caption about clips receiving more replies than photo albums.',
    'Show that viewers respond better to video than slides.',
    'Record a tutorial; your audience loves this format.',
    'Draft a caption describing the account’s exceptional engagement.',
    'Show clips attracting greater attention compared with carousels.',
    'Show viewers enjoying videos ahead of static posts.',
    'Film a recap of clips with a fivefold advantage in replies.',
    'Show how videos beat carousels on comment counts.',
]


def generate(form):
    audit, metrics = connected_case()
    client = _Client([json.dumps(form), json.dumps(form)])
    gen = _generator(client)
    gen.model = MODEL
    return gen.generate(audit, lambda *a: None, research_cache='{"web":[]}', ig_metrics=metrics), client


@pytest.mark.parametrize('typed', [False, True])
@pytest.mark.parametrize('instruction', ADVERSE)
def test_unsupported_task_claims_withheld_by_actual_generator(instruction, typed):
    form = strategy_form()
    form['strategy']['decisions'][0]['tasks'][0] = (
        dict(kind='creative_proposal', instruction=instruction) if typed else instruction)
    with pytest.raises(GenerationStageError) as error:
        generate(form)
    assert error.value.error_code == 'structured_output_invalid'
    assert not error.value.retryable


def test_typed_proposal_and_fact_survive_generator_with_local_value():
    form = strategy_form()
    form['strategy']['decisions'][0]['tasks'].append(
        dict(kind='measured_fact', calculation_id='CALC#VIDEO-comments_count'))
    result, client = generate(form)
    assert 'pantry-to-bowl transformation' in result.html
    assert 'Measured reference' in result.html
    assert 'mean comments per post = 11.5' in result.html
    assert len(client.calls) == 1
    sent = client.calls[0]['messages'][-1]['content']
    assert 'creative_proposal' in sent and 'measured_fact' in sent


@pytest.mark.parametrize('task', [
    dict(kind='measured_fact', calculation_id='CALC#VIDEO-comments_count', value=99),
    dict(kind='measured_fact', calculation_id='CALC#VIDEO-comments_count', instruction=ADVERSE[0]),
    dict(kind='measured_fact', calculation_id='CALC#VIDEO-reach'),
    dict(kind='measured_fact', calculation_id='CALC#invented'),
    dict(kind='measured_fact', calculation_id='IG#post1'),
    dict(kind='audience_preference', instruction=ADVERSE[2]),
    dict(kind='creative_proposal', instruction=ADVERSE[0], evidence_ids=['IG#post1']),
])
def test_fact_branch_cannot_authorize_free_prose_or_wrong_measure(task):
    form = strategy_form()
    form['strategy']['decisions'][0]['tasks'].append(task)
    with pytest.raises(GenerationStageError) as error:
        generate(form)
    assert error.value.error_code == 'structured_output_invalid'
    assert not error.value.retryable


@pytest.mark.parametrize('instruction', [
    'Storyboard a split-screen pantry substitution beside the finished lentil bowl.',
    'Show how to fold the repaired strap beside the packed travel bag.',
    'Ask the audience to choose a pantry ingredient for the next cooking sequence.',
    'Film a close-up zipper repair with contrasting thread and a slow final reveal.',
    'Draft a caption inviting comments about alternative ingredients for the bowl.',
    'Compare a silent overhead preparation sequence with a narrated kitchen walkthrough.',
])
def test_original_production_proposals_remain_open_not_canned(instruction):
    form = strategy_form()
    form['strategy']['decisions'][0]['tasks'][0]['instruction'] = instruction
    result, client = generate(form)
    assert instruction in result.html
    assert len(client.calls) == 1
    assert 'Priority 1' in result.html and 'Dependency: S1' in result.html
    assert '15.5' in result.html and '11.5' in result.html


def test_public_positioning_cannot_invent_measured_fact():
    from test_product_strategy import public_case
    from auditlayer_worker import factual
    audit, evidence, form = public_case()
    form['strategy']['decisions'][0]['tasks'].append(
        dict(kind='measured_fact', calculation_id='CALC#VIDEO-comments_count'))
    with pytest.raises(ValueError, match='local diagnosis'):
        factual.render(audit, json.dumps(form), evidence=evidence)


def test_measured_facts_do_not_replace_original_production_work():
    form = strategy_form()
    form['strategy']['decisions'][0]['tasks'][0] = dict(
        kind='measured_fact', calculation_id='CALC#VIDEO-comments_count')
    with pytest.raises(GenerationStageError):
        generate(form)
