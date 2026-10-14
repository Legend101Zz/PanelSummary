"""Defect-kind classifier for judge defect texts (v0.1 rules, unchanged).

Moved from the build machine's launch/clusters/kinds2.py (issue #92). The keyword
rules, their order and the kind names are the v0.1 rules, byte for byte. Do not edit
a rule: every published defect rate (docs/v0.2/GATES.md) is measured with it. A new
kind or a changed rule needs a new module version and a note in
scripts/acceptance/README.md, because it breaks the comparison with old runs.

A defect text can match several kinds; each match counts once for that defect.
"""
import re

K=[
('claim_not_stated','Planned core claim only half conveyed: key line, fact or punchline absent from the page text (e.g. gilded/sapphire/ruby, price, request, reason)',r"core claims?\b|\bclaims? [sk]?\d|\bk\d+\b|s\dk\d+|CLAIM_THIN|not conveyed|half conveyed|(only|weakly|partly|thinly) conveyed|unsupported by the text|never states|is not stated|no (literal|text) |nothing (says|states)|central request is missing|motive is missing|is incomplete"),
('hero_tiny','Key figure or prop tiny, a speck/blob, or cropped at the panel edge (speaker or hero hard to find)',r"\btiny\b|speck|few pixels|sliver|nearly invisible|SUBJECT_TOO_SMALL|too small|px tall|hard to find|near-invisible|\bblob\b|barely (visible|reads)|cropped (at|by|into|off)|pushed to|thin strip|unreadable (dot|blob)|is a dot|small figure|a dot\b"),
('key_prop_not_drawn','Key prop or action of the beat never drawn (leaden heart, thorn, sack, sheep, kiss, plucked eye, gold leaf, Angel, tears)',r"(never|not|isn't) (drawn|shown|visible|appear)|(is|are) never (drawn|shown|visible)|does not appear|\babsent\b|nowhere|no (sheep|angel|thorn|heart|sack|tears?|lamp|ladder|rose|figures)\b|cannot be seen|never shows|has no visual|no picture of|cannot be read"),
('tail_wrong','Balloon tail points at the wrong figure or off-panel, or the speaker is not drawn / ambiguous (SPEAKER_OFF_PANEL)',r"SPEAKER_OFF_PANEL|SPEAKER_ORDER|PLANNED_CAST_MISSING|tail[s]? (point|runs?|ends|lands?|crosses|goes|leads?|aims?|hits|converge|rises|collide|tip)|(no|without a|has no) (visible )?tail|speaker (is )?(not drawn|ambiguous|unclear|headless)|unclear who (speaks|is speaking)|who is speaking|reads? as the \w+ speaking|looks? like the speaker|attribute .{0,50} to the|second tail|ambiguous (cluster|speaker)|(speaker|who|spoken by).{0,40}(is )?not drawn"),
('setting_wrong','Setting/location contradicts the source or neighbouring pages, or panel is a blank void (wrong l_* location)',r"location|\bl_[a-z_]+|LOCATION_NOT_PLANNED|staging|set in the|blank white|white void|no (background|environment)|contradicts the source|outside on|source (places|puts|says)|empty (white|plaza|street|ballroom)"),
('invented','Invented dialogue/caption/staging or wrong cast member (CAST_NOT_PLANNED, dramatized line, wrong speaker identity)',r"invent|dramati[sz]|made.?up|CAST_NOT_PLANNED|not part of (this|the) scene|wrong (character|cast)|misattribut|drawn as the|never speaks|speaks '|no source"),
('page_turn','No page-turn hook, hook spent early, or weak page ending',r"page.?turn|cliffhanger|no hook|hook (lands|is spent|spent)|spends? (the|its) hook|ends? (flat|on a|with no)|no pull"),
('statue_staging','Statue/Prince staged wrong: no tall column, street level, human-sized on a plinth, or inside a room',r"(no|without|missing|lacks?|not on|never|plain|short|low) (tall )?(column|pedestal|plinth)|street level|person-sized|(low|plain|a) plinth|slab|human-sized statue|plain block|inside the (garret|attic)|stands inside|reads as a human|alley"),
('speech_as_narration','Spoken line drawn as thought bubble / narration box (SPEECH_IN_NARRATION) or narration put in a speech balloon',r"thought (balloon|bubble|cloud)|SPEECH_IN_NARRATION|unattributed narration|narration box over|in a narration box|read as narration|set as narration|narrator text|as a speech balloon|in the \w+'s mouth|(line|quote) .{0,30}(as|in) (a )?caption"),
('state_continuity','State/identity continuity breaks between panels or pages (eyes plucked vs intact, gold vs grey, wrong tree species, scale jumps, gem drawn as diamond)',r"\beyes?\b.{0,60}(blind|hollow|sockets|plucked|intact)|blind after|variant eyes|one bright eye|already (stone|grey|dull)|still fully gilded|gold to dull|continuity|inconsistent|looks different|conifer|which tree|scale (jumps|is wrong)|ruby (renders|is drawn|reads)|sapphire (is|renders)|grey (cut )?diamond|looks like a different|stays? (white|grey)"),
('order','Panel or balloon reading order breaks the dialogue (reply before question, climax before setup)',r"reply (before|precedes)|before the question|reading order|wrong order|order (is )?(inverted|reversed|inverts)|inverts the chronology|reverses the|out of order|BLOCKAGE_LAYOUT|reads? (first|before|backwards)|is read first|reveal comes before|scrambles|balloon order|new reader goes"),
('beat_skipped','Source beat or exchange skipped so a line has no antecedent/setup',r"no antecedent|no earlier page|appeared on no|has no setup|no setup|never set up|exchange is missing|(is|are) skipped|are dropped|unintelligible|non sequitur"),
('quote_clipped','Quote clipped, spliced, merged or truncated so the line loses its punch (or text mangled)',r"clipped|spliced|truncat|mangled|garbled|ellips|cut (to|down)|trimmed|fused|merges|merged|punchline|joke is lost|split (over|across|into)|is cut\b|cut from the quote"),
('label_clutter','Caption-heavy page: name-tag labels, duplicate or restating captions, PROSE_WALL, illustrated prose',r"name.?tag|duplicate (caption|label)|floating (caption|label)|label boxes?|caption boxes?|name captions?|restates?|PROSE_WALL|prose.wall|stray (caption|label)|redundant|caption .{0,30}(clutter|sits on|covers)|illustrated prose|narration boxes"),
('cast_crowd','Individual cast as generic crowd or wrong head-count (Christ-child, two boys, Charity Children, one child for children)',r"c_children|c_boys|three (similar )?(kids|children)|single child|one child|few'|not individuated|not a distinct|which child|many-children|crowd of (grey )?(kids|children)|generic (children|crowd)"),
('repeat_variety','Repeated near-identical panels, no dominant panel, flat variety',r"repeat|same (shot|image|pose|crop|framing|background)|identical|near-duplicate|reused|similar framing|two close-ups|three close|no dominant|equal weight|talking heads|look alike"),
('plan_overload','Plan packs too many claims/scenes into one page or assigns claims the page cannot show',r"overload|overreach|over-promise|packed into|crams?\b|crammed|asks for both|too many (beats|scenes|claims)|five voices|four scenes|three scenes|outside what one page"),
('fidelity_label','Quote fidelity label wrong (verbatim line labelled paraphrase/dramatized, or the reverse)',r"labell?ed (as )?(a )?(paraphrase|quote|dramati)|tagged (as )?(a )?(paraphrase|quote)|fidelity label"),
('page_missing','Page never produced: writer hit token limit (NO_SUBMISSION), leaving a hole in the story',r"NO_SUBMISSION|token limit|ran out of tokens"),
('balloon_covers','Balloon or caption covers the speaker, prop or head; balloons stacked or cramped',r"balloons? .{0,50}(covers?|overlap|run over|hides?)|(covers?|hides?|overlaps?) .{0,30}(head|face|body|figure)|stacked balloons|cramped"),
('pose_unreadable','Expression/pose unreadable (dead bird looks asleep, angry brows on tender line, glow behind head)',r"expression|reads as (asleep|angry)|angry brow|heavy brow|brows?\b|halo|looks? asleep|reads as sleeping|glow behind"),
]


def labels(d):
    """Kinds that match one defect dict (it has a "what" text)."""
    return [k for k, _, r in K if re.search(r, d['what'], re.I)]


TITLE = {k: t for k, t, _ in K}
KINDS = [k for k, _, _ in K]
