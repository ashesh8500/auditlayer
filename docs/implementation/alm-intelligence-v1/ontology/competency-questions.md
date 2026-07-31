# Competency questions — SPARQL sketches + SQL twins

These six questions are the product/ontology acceptance bar. SQL against
Postgres is authoritative at runtime; SPARQL is documentation/CI only
(no graph DB). Table names are the shipped kernel names.

---

## Q1. What is still believed about this Subject since last quarter?

**SPARQL (sketch):**
```sparql
SELECT ?claim ?observedAt WHERE {
  ?subject a alm:Subject ; alm:subjectId ?sid .
  FILTER(?sid = $SUBJECT)
  ?item a alm:EvidenceItem ; alm:about ?subject ;
        alm:contentHash ?claim ; alm:observedAt ?observedAt .
  FILTER(?observedAt >= $QUARTER_START)
}
```

**SQL twin:**
```sql
select e.id, e.content_hash, e.observed_at, e.source_type, e.confidence
from public.evidence e
where e.subject_id = $subject_id
  and e.observed_at >= $quarter_start
order by e.observed_at desc;
```

---

## Q2. What changed in evidence vs only in brief/lens?

**SPARQL (sketch):**
```sparql
SELECT ?dimension ?cause WHERE {
  ?run a alm:IntelligenceRun ; alm:aboutSubject ?subject .
  ?score a alm:Score ; alm:producedBy ?run ;
         alm:dimension ?dimension ; alm:changeCause ?cause .
}
```

**SQL twin:**
```sql
select s.dimension, s.value, s.previous_value, s.change_kind, s.methodology_version
from public.scores s
join public.intelligence_runs ir on ir.id = s.intelligence_run_id
where ir.subject_id = $subject_id
  and ir.created_at >= $since
order by ir.created_at desc, s.dimension;
-- change_kind ∈ {evidence, brief_lens, methodology, prior_correction}
```

---

## Q3. Which recommendations did the client reject (and must not revive)?

**SQL twin:**
```sql
select r.id, r.recommendation_ref, r.status, r.created_at, d.decision, d.note, d.created_at as decided_at
from public.recommendations r
join public.intelligence_runs ir on ir.id = r.intelligence_run_id
left join public.decisions d
  on d.target_type = 'recommendation' and d.target_id = r.id
where ir.subject_id = $subject_id
  and (r.status = 'rejected' or d.decision = 'rejected')
order by coalesce(d.created_at, r.created_at) desc;
```

---

## Q4. Where do intended positioning and public perception diverge?

**SQL twin:**
```sql
-- Intended: latest confirmed Living Brief positioning
select lb.version, lb.positioning, lb.confirmed, lb.created_at
from public.living_brief_versions lb
where lb.subject_id = $subject_id and lb.confirmed = true
order by lb.version desc
limit 1;

-- Perceived: recent findings tagged branding/perception (payload-driven in v1)
select f.id, f.claim, f.evidence_ids, f.confidence, ir.created_at
from public.findings f
join public.intelligence_runs ir on ir.id = f.intelligence_run_id
where ir.subject_id = $subject_id
  and (f.dimension_impacts ? 'branding' or f.dimension_impacts ? 'perception')
order by ir.created_at desc
limit 50;
```

---

## Q5. Which channels are Managed vs Observed for this tenant?

**SQL twin:**
```sql
-- Managed / connected channels on subjects owned by the tenant
select sc.id, sc.channel_type, sc.locator, sc.managed, sc.account_id, a.ownership_status
from public.subject_channels sc
join public.subjects s on s.id = sc.subject_id
left join public.accounts a on a.id = sc.account_id
where s.user_id = $user_id;

-- Observed-only: audits for the tenant without a managed subject channel
select au.id, au.handle, au.platform, au.account_id
from public.audits au
where au.user_id = $user_id
  and not exists (
    select 1
    from public.subject_channels sc
    join public.subjects s on s.id = sc.subject_id
    where s.user_id = au.user_id
      and sc.managed = true
      and lower(sc.locator) = lower(au.handle)
      and sc.channel_type = au.platform
  );
```

---

## Q6. Why did Branding score move +N since the last run?

**SQL twin:**
```sql
select s.dimension, s.value, s.previous_value,
       (s.value - s.previous_value) as delta,
       s.change_kind, s.evidence_ids, s.methodology_version, ir.created_at
from public.scores s
join public.intelligence_runs ir on ir.id = s.intelligence_run_id
where ir.subject_id = $subject_id
  and s.dimension = 'branding'
  and s.previous_value is not null
order by ir.created_at desc
limit 1;
-- UI must not call drift "progress" when methodology/prompt/lens versions differ
-- (inspect intelligence_runs pins for comparability).
```
