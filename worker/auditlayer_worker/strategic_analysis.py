"""Typed strategic decisions over local descriptive diagnoses.

Measured statements are never model prose. Creative tasks are prospective
editorial instructions, not verified assertions. Lexical safety checks reject
known unsafe claim forms; they are not a general semantic entailment judge.
"""
import re
import json
from itertools import combinations
from .core import _structured_text

OBJECTIVES = {
    'conversation': ('Invite a specific audience response', 'comments_count'),
    'discovery': ('Test discoverability of a creative direction', 'reach'),
    'product_education': ('Explain product use before testing purchase intent', 'reach'),
    'repeatable_series': ('Develop a repeatable editorial series', None),
}
METHOD = 'METH#strategic-decisions-v1'
# Reject assertions masquerading as instructions. Facts belong in source IDs,
# not task prose. This intentionally accepts original creative execution text.
UNSAFE = re.compile(r'\d|[%$€£]|\b(?:zero|hundred|thousand|million|percent|score|guarantee\w*|'
    r'proven|causes?|caused|because|therefore|always|never|lacks?|missing|absent|'
    r'no funnel|has no|have no|without any|best.performing|outperform\w*|'
    r'website|checkout|SEO|demographics|followers are|audience is)\b', re.I)
DIRECTIVE = re.compile(r'^(?:Film|Draft|Create|Show|Invite|Compare|Adapt|Record|Prepare|Test|'
    r'Edit|Sequence|Pair|Build|Ask|Use|Keep|Review|Publish|Repurpose|Collect|Confirm|'
    r'Label|Track|Plan|Schedule|Write|Design|Storyboard|Feature|Demonstrate)\b')


def diagnoses(snapshot):
    """Reproducible sample comparisons; no model arithmetic or impact score."""
    if snapshot.get('public_sources'):
        refs = [r['source_id'] for r in snapshot['public_sources']]
        return [dict(id='DIAG#public-positioning', kind='source_positioning', metric=None,
                     evidence_ids=refs, calculation_ids=[], method_id=METHOD)]
    output = []
    for c in snapshot['calculations']:
        if c['measured_count'] >= 2:
            output.append(dict(id=f'DIAG#{c["media_type"]}-{c["metric"]}-baseline',
                kind='descriptive_baseline', metric=c['metric'], left=c,
                evidence_ids=c['evidence_ids'], calculation_ids=[c['source_id']], method_id=METHOD))
    for left, right in combinations(snapshot['calculations'], 2):
        if left['metric'] != right['metric'] or min(left['measured_count'], right['measured_count']) < 2:
            continue
        sid = f'DIAG#{left["media_type"]}-{right["media_type"]}-{left["metric"]}'
        output.append(dict(id=sid, kind='descriptive_format_comparison', metric=left['metric'],
            left=left, right=right, evidence_ids=left['evidence_ids'] + right['evidence_ids'],
            calculation_ids=[left['source_id'], right['source_id']], method_id=METHOD))
    return output


def instructions(snapshot):
    catalogue = [{k: v for k, v in d.items() if k not in ('left', 'right')} for d in diagnoses(snapshot)]
    return (
        'Also return required strategy: {diagnosis_ids, decisions}. diagnosis_ids selects 1-3 IDs from '
        'the local diagnosis catalogue below. Do not write factual diagnoses: local code computes and '
        'renders those comparisons and their limits. decisions contains 2-3 original concrete strategic '
        'actions {id, rank, diagnosis_id, evidence_ids, objective, effort, horizon, depends_on, tasks}. '
        'id S1..S4; ranks contiguous from 1 and in output order; diagnosis_id must be selected. '
        'evidence_ids: 2-4 distinct observed source IDs contributing to that diagnosis. '
        'objective: conversation, discovery, product_education or repeatable_series; use conversation '
        'only with comments_count, discovery/product_education only with reach; repeatable_series may '
        'use any measured metric. effort: low/medium/high editorial production estimate, NOT impact. '
        'horizon: next_batch or after_review. depends_on: earlier decision IDs, required for after_review. '
        'tasks: 2-3 distinct original prospective imperative production instructions, each 20-180 '
        'characters, starting with Film, Draft, Create, Show, Invite, Compare, Adapt, Record, Prepare, '
        'Test, Edit, Sequence, Pair, Build, Ask, Use, Keep, Review, Publish, Repurpose, Collect, Confirm, '
        'Label, Track, Plan, Schedule, Write, Design, Storyboard, Feature or Demonstrate. '
        'Use the client context and selected captions to devise NEW executions, not copied quotes. '
        'No metrics, scores, numeric claims, absence assertions, causal certainty, claims about existing '
        'visuals/audiences or website work in tasks. Facts must use source IDs, not task prose. '
        'Rank by relevance and production tradeoffs; do not claim the ranking predicts return. '
        'Propose a distinct follow-up decision after review, not an invented growth forecast. '
        'Local diagnosis catalogue: ' + json.dumps(catalogue) + '\n')


def validate(value, snapshot, observed):
    def keys(obj, expected):
        if not isinstance(obj, dict) or set(obj) != set(expected.split()):
            raise ValueError('invalid strategic decision fields')
    keys(value, 'diagnosis_ids decisions')
    catalogue = {d['id']: d for d in diagnoses(snapshot)}
    selected = value['diagnosis_ids']
    if (not isinstance(selected, list) or not 1 <= len(selected) <= 3
            or any(not isinstance(s, str) or s not in catalogue for s in selected)
            or len(set(selected)) != len(selected)):
        raise ValueError('strategy requires measured local diagnoses')
    decisions = value['decisions']
    if not isinstance(decisions, list) or not 2 <= len(decisions) <= 3:
        raise ValueError('strategy requires prioritized decisions and follow-up')
    seen, tasks_seen, used = set(), set(), set()
    for rank, row in enumerate(decisions, 1):
        keys(row, 'id rank diagnosis_id evidence_ids objective effort horizon depends_on tasks')
        sid, did, objective = row['id'], row['diagnosis_id'], row['objective']
        if (not isinstance(sid, str) or not re.fullmatch(r'S[1-4]', sid) or sid in seen
                or type(row['rank']) is not int or row['rank'] != rank
                or not isinstance(did, str) or did not in selected
                or not isinstance(objective, str) or objective not in OBJECTIVES):
            raise ValueError('invalid strategic rank, diagnosis or objective')
        diagnosis = catalogue[did]
        metric = OBJECTIVES[objective][1]
        if metric and diagnosis['metric'] is not None and diagnosis['metric'] != metric:
            raise ValueError('strategic objective requires its measured proxy')
        support = row['evidence_ids']
        if (not isinstance(support, list) or not 2 <= len(support) <= 4
                or any(not isinstance(s, str) or s not in observed or s not in diagnosis['evidence_ids'] for s in support)
                or len(set(support)) != len(support)):
            raise ValueError('strategic evidence must be observed contributing posts')
        if row['effort'] not in ('low', 'medium', 'high') or row['horizon'] not in ('next_batch', 'after_review'):
            raise ValueError('invalid strategic effort or horizon')
        deps = row['depends_on']
        if (not isinstance(deps, list) or any(not isinstance(d, str) or d not in seen for d in deps)
                or len(set(deps)) != len(deps) or (row['horizon'] == 'after_review' and not deps)
                or (rank == 1 and row['horizon'] != 'next_batch')):
            raise ValueError('strategy dependency must precede dependent decision')
        tasks = row['tasks']
        if not isinstance(tasks, list) or not 2 <= len(tasks) <= 3:
            raise ValueError('strategic production tasks required')
        for task in tasks:
            if (not isinstance(task, str) or not 20 <= len(task) <= 180 or not DIRECTIVE.match(task)
                    or UNSAFE.search(task) or '\n' in task):
                raise ValueError('production task must be prospective, nonnumeric and scope-safe')
            _structured_text(task, 'proposed production instruction', 180)
            normal = ' '.join(task.casefold().split()).rstrip('.')
            if normal in tasks_seen:
                raise ValueError('duplicate strategic production task')
            tasks_seen.add(normal)
        used.add(did)
        seen.add(sid)
    if used != set(selected) or not any(d['horizon'] == 'after_review' for d in decisions):
        raise ValueError('selected diagnoses and follow-up must inform a decision')
    return value


def sections(value, snapshot):
    from .connected_analysis import METRICS
    def item(title, body):
        # Framework truncates bodies at 320; keep every locally built unit bounded.
        if len(body) > 320:
            raise ValueError('strategic renderer exceeded information budget')
        return dict(title=title, body=body, value='')
    catalogue = {d['id']: d for d in diagnoses(snapshot)}
    findings, strategy, briefs, roadmap = [], [], [], []
    for did in value['diagnosis_ids']:
        d = catalogue[did]
        if d['kind'] == 'source_positioning':
            findings.append(item('Positioning diagnosis · ' + did,
                'The admitted statements supply editorial themes for a positioning test, not verified performance. '
                'Prioritize a concrete expression of those themes before drawing conclusions about audience fit.'))
            findings.append(item('Source scope · ' + did,
                'Unmeasured public-source strategy. Basis: ' + ', '.join(d['evidence_ids']) + '. '
                'Source statements are attributed, not independent proof of visuals, audience preferences or results.'))
            continue
        if d['kind'] == 'descriptive_baseline':
            a = d['left']
            findings.append(item('Single-format baseline · ' + did,
                f'{a["media_type"]}: mean {METRICS[d["metric"]]} {a["mean"]:g}; '
                f'{a["measured_count"]} of {a["eligible_count"]} admitted posts measured. '
                'Use as a descriptive reference for a new execution, not as a causal explanation or a target.'))
            findings.append(item('Baseline provenance · ' + did, a['source_id'] + '. '
                'No cross-format comparison is asserted by this diagnosis.'))
            continue
        a, b = d['left'], d['right']
        findings.append(item('Descriptive diagnosis · ' + did,
            f'{a["media_type"]}: mean {METRICS[d["metric"]]} {a["mean"]:g} ({a["measured_count"]}/{a["eligible_count"]} measured). '
            f'{b["media_type"]}: {b["mean"]:g} ({b["measured_count"]}/{b["eligible_count"]} measured). '
            'This sample difference is not a causal explanation or an account-wide ranking.'))
        findings.append(item('Diagnosis provenance · ' + did,
            'Derived locally from ' + ', '.join(d['calculation_ids']) + '. '
            'Post age, topic and distribution are uncontrolled; do not infer format effects.'))
    for row in value['decisions']:
        d = catalogue[row['diagnosis_id']]
        title = f'Priority {row["rank"]} · {row["id"]}'
        strategy.append(item(title, OBJECTIVES[row['objective']][0] + '. '
            f'Proposed effort: {row["effort"]}; editorial estimate, not measured impact. '
            'Dependency: ' + (', '.join(row['depends_on']) or 'none') + '.'))
        strategy.append(item('Decision basis · ' + row['id'],
            f'Investigate {row["diagnosis_id"]}; reuse source material from ' + ', '.join(row['evidence_ids']) + '. '
            'Priority is an editorial choice to test, not a predicted return.'))
        for task in row['tasks']:
            briefs.append(item('Proposed production task · ' + row['id'], task))
        if row['objective'] == 'product_education':
            strategy.append(item('Sales attribution boundary · ' + row['id'],
                'Reach measures exposure, not purchases. Pair the proposed education test with owner-authorized '
                'tagged destination visits and orders before making a sales decision. These outcomes are not present in this snapshot.'))
        roadmap.append(item(('Next batch' if row['horizon'] == 'next_batch' else 'After evidence review') + ' · ' + row['id'],
            'Prepare the proposed tasks, then compare ' + METRICS.get(d['metric'], 'owner-authorized outcomes') + ' at a common post age. '
            'Retain only a replicated direction; revise mixed results and stop a direction that does not justify its production effort.'))
    strategy.append(item('Production tradeoff · ' + METHOD,
        'Low effort: reuse assets; medium: new sequence or edit; high: new production setup. '
        'Estimates require owner confirmation. Start with the highest-priority feasible decision; defer dependent work until review.'))
    return findings, strategy, briefs, roadmap
