"""Non-content validation diagnostics. Never derive messages from exceptions.

Only locally assigned enum members cross the correction/telemetry boundary.
Unknown validators deliberately receive generic guidance, not repr/str, keys,
source IDs, excerpts, model text, or traceback inspection.
"""
from enum import Enum


class ValidationCode(Enum):
    CONTRACT = (
        'analysis_contract_invalid', 'analysis',
        'Return the complete supplied JSON contract with exact fields and constraints; '
        'retain evidence checks and do not add unsupported claims or scores.')
    MEASURED_SUPPORT = (
        'connected_support_measured_posts', 'interpretations[].observation_ids',
        'Include at least two distinct selected IG#post observation IDs whose posts have '
        'a non-null value for this interpretation metric. CALC and WEB sources do not '
        'count as measured posts; calculation inputs are not automatically support.')
    SUPPORT_DOMAIN = (
        'connected_support_domain', 'interpretations[].observation_ids,metric,question',
        'Use 2-4 distinct IDs from selected observations; metric must be like_count, '
        'comments_count or reach; question must be creative_emphasis, repeatability '
        'or format_transfer, not free text.')
    FOCUS = (
        'connected_focus_treatment', 'recommendations[].treatment',
        'Copy the linked interpretation focus exactly, including source_id and phrase, '
        'into treatment; keep control a distinct caption phrase.')
    QUESTION_CHANGE = (
        'connected_question_change', 'interpretations[].question,recommendations[].change',
        'Use change=format if and only if the linked question is format_transfer. '
        'For creative_emphasis or repeatability use opening or sequence.')


class AnalysisValidationError(ValueError):
    def __init__(self, code: ValidationCode):
        if type(code) is not ValidationCode:
            raise TypeError('A static validation code is required')
        self.code = code
        super().__init__(code.value[0])


def safe_validation_reason(error: ValueError) -> dict[str, str]:
    # Exact types, not duck typing: arbitrary exception attributes are untrusted.
    code = error.code if type(error) is AnalysisValidationError else ValidationCode.CONTRACT
    if type(code) is not ValidationCode:
        code = ValidationCode.CONTRACT
    name, field, constraint = code.value
    return {'code': name, 'field': field, 'constraint': constraint}
