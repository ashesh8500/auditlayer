"""Authored synthetic strategy forms; not model output."""
from test_factual_repair import experiment_form

def strategy_form(kind='creator'):
    data = experiment_form(kind)
    metric = 'comments_count' if kind == 'creator' else 'reach'
    diagnosis = 'DIAG#VIDEO-CAROUSEL_ALBUM-' + metric
    tasks = (['Film a pantry-to-bowl transformation with the finished dish before ingredient handling.',
              'Invite viewers to suggest a pantry substitution in the closing caption.'] if kind == 'creator' else
             ['Film the zipper replacement as a stepwise demonstration alongside the packed bag.',
              'Invite viewers to choose between a repair walkthrough and a packing demonstration.'])
    data['strategy'] = {'diagnosis_ids': [diagnosis], 'decisions': [
        {'id': 'S1', 'rank': 1, 'diagnosis_id': diagnosis, 'evidence_ids': ['IG#post1', 'IG#post2'],
         'objective': 'conversation' if kind == 'creator' else 'product_education',
         'effort': 'medium', 'horizon': 'next_batch', 'depends_on': [], 'tasks': tasks},
        {'id': 'S2', 'rank': 2, 'diagnosis_id': diagnosis, 'evidence_ids': ['IG#post1', 'IG#post2'],
         'objective': 'repeatable_series', 'effort': 'low', 'horizon': 'after_review', 'depends_on': ['S1'],
         'tasks': ['Adapt the selected topic into a recurring sequence with a consistent opening.',
                   'Compare the variants at a common post age before scheduling the next batch.']}]}
    return data
