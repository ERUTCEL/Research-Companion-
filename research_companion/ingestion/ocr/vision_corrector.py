import re
import structlog

log = structlog.get_logger()

# Common OCR mis-reads for academic text
_CORRECTIONS: list[tuple[str, str]] = [
    (r"\bl\b", "1"),          # lowercase L as digit 1
    (r"\bO\b", "0"),          # letter O as zero in numeric contexts
    (r"ﬁ", "fi"),
    (r"ﬂ", "fl"),
    (r"ﬀ", "ff"),
    (r"ﬃ", "ffi"),
    (r"ﬄ", "ffl"),
    (r"­", ""),          # soft hyphen
    (r"-\n", ""),             # hyphenated line breaks
]


class VisionCorrector:
    """Lightweight post-processing for OCR output."""

    def correct(self, text: str, lang: str = "en") -> str:
        for pattern, replacement in _CORRECTIONS:
            text = re.sub(pattern, replacement, text)

        text = self._fix_spacing(text)
        log.debug("vision_corrector_done", lang=lang, chars=len(text))
        return text

    @staticmethod
    def _fix_spacing(text: str) -> str:
        text = re.sub(r" {2,}", " ", text)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()
