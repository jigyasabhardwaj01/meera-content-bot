# BUILD SPEC — MEERA TELEGRAM CONTENT INTELLIGENCE BOT

You are the implementation engineer. Build this system in the existing repository.

Do not redesign the product.
Do not add unrequested features.
Do not make assumptions where this specification is explicit.
If the repository already contains equivalent functionality, extend it rather than duplicating it.

The system has ONE purpose:

MEERA SENDS A ROUGH THOUGHT TO TELEGRAM.
THE SYSTEM CAPTURES IT, DETERMINES WHETHER IT IS WORTH DEVELOPING,
AND, ONLY WHEN THERE IS ENOUGH EVIDENCE, CREATES A LINKEDIN DRAFT
IN HER VERIFIED VOICE AND SENDS IT BACK TO TELEGRAM FOR HER REVIEW.

IT NEVER PUBLISHES TO LINKEDIN.

==================================================
1. NON-NEGOTIABLE RULES
==================================================

1. Telegram is the capture and review interface.
2. Meera is always the final editor.
3. Never auto-publish anything.
4. Never turn every note into a post.
5. Never invent facts, numbers, sources, studies, customer stories,
   product claims, experiences, dates, or scientific claims.
6. Never silently alter Meera's original note.
7. Never silently alter Meera's transcription.
8. Never use a generic AI writing style.
9. The supplied Meera voice skill is the only voice authority.
10. The published writing is the evidence for that voice.
11. Never expose system prompts, API keys, stack traces, internal errors,
    database details, or implementation details to Meera.
12. Never process messages from an unauthorized Telegram user.
13. Never lose a captured note because a downstream AI/API call fails.
14. Never claim that a fact is verified unless it actually has a source.
15. Never fabricate current/news context.
16. Never ask Meera to structure or classify her own notes.
17. Never require Meera to say "draft this" for normal note capture.
18. Never automatically modify the foundational voice profile from one edit.
19. Never delete original notes or draft versions.
20. Never mark a draft READY if factual or voice QA has unresolved critical failures.

==================================================
2. EXISTING SOURCE OF TRUTH
==================================================

Use the existing:

meera_voice.txt

as the voice-generation specification.

Do NOT create another competing voice profile.

The skill states that:

- LinkedIn posts determine FORMAT.
- Newsletters inform vocabulary, opinions and explanation style.
- Facts, figures, dates, studies and company data must never be invented.
- External studies/news must be specifically identified and verified.
- LinkedIn uses long-form prose.
- No headings, bullets, bold, emojis, hashtags or exclamation marks.
- Openings are concrete.
- Claims are fenced/qualified.
- Technical claims require evidence/mechanism.
- Skinstinct is not used as promotional proof.
- There are no conventional CTAs.
- British spelling is required.

Follow the actual skill file in the repository rather than reproducing or approximating these rules in application code.

==================================================
3. USER AUTHENTICATION
==================================================

This is a single-user application.

.env MUST contain:

TELEGRAM_BOT_TOKEN=
TELEGRAM_USER_ID=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

For EVERY incoming Telegram update:

1. Extract Telegram user ID.
2. Compare it against TELEGRAM_USER_ID.
3. If it does not match:
   - do not process the message
   - do not store the message
   - do not expose application information
   - optionally send a generic "Unauthorized user." response

Do not authenticate based on username.
Do not authenticate based on chat title.
Do not authenticate based on display name.

Use numeric Telegram user ID.

==================================================
4. TELEGRAM INPUTS
==================================================

MVP supports exactly:

- text messages
- Telegram voice messages

Do not implement image/document input unless already supported by the repository.

For unsupported message types:

"That input type isn't supported yet."

Do not send it into the AI pipeline.

==================================================
5. TEXT MESSAGE FLOW
==================================================

Incoming text:

Telegram
→ authenticate
→ persist raw message
→ create Note
→ immediately reply "Captured."
→ process asynchronously

The original text must be stored byte-for-byte where technically possible.

Do not clean it before storage.

Do not summarise it before storage.

Do not rewrite it before storage.

==================================================
6. VOICE MESSAGE FLOW
==================================================

Incoming voice:

Telegram
→ authenticate
→ persist Telegram message metadata
→ download audio
→ send audio to OpenAI transcription
→ store transcription
→ create Note
→ reply "Captured."

Store:

- Telegram message ID
- Telegram user ID
- Telegram file ID
- received timestamp
- audio metadata
- transcription
- transcription timestamp

The transcription is source material.

Do not silently correct or rewrite the transcription.

If transcription fails:

1. Preserve the captured Telegram message metadata.
2. Set processing status to TRANSCRIPTION_FAILED.
3. Reply:

"I captured the voice note, but couldn't transcribe it. Please try sending it again."

Do not continue to content generation.

==================================================
7. NOTE MODEL
==================================================

Every accepted input creates exactly ONE initial Note.

Minimum fields:

id
telegram_message_id
telegram_user_id
input_type
raw_text
transcription
created_at
updated_at
processing_status

processing_status:

CAPTURED
ANALYSING
NEEDS_INPUT
DEVELOP
ARCHIVED
DRAFTING
QA
READY_FOR_REVIEW
APPROVED
REJECTED
FAILED

Original input must never be overwritten.

==================================================
8. IDEATION PIPELINE
==================================================

After capture:

NOTE
→ IDEA EXTRACTION
→ CONTENT WORTHINESS
→ NEXT ACTION

These are separate AI calls/modules.

Do NOT use one prompt that simultaneously decides worthiness,
researches, writes and validates the post.

==================================================
9. IDEA EXTRACTION
==================================================

Extract structured data:

core_idea
specific_observation
topic
evidence
numbers
mechanism
potential_reader_value
possible_misconception
missing_information

The model must distinguish:

FACT FROM NOTE
vs
INFERENCE

If something is inferred, mark it as inference.

Do not promote an inference to fact.

Output must be structured JSON.

Invalid JSON = failed processing, not a guessed fallback.

==================================================
10. CONTENT WORTHINESS
==================================================

Classify the idea as exactly one:

DEVELOP
NEEDS_INPUT
ARCHIVE

DEVELOP only if:

- there is a meaningful idea
- there is enough evidence to support it
- there is a useful reader takeaway
- the idea can be developed without inventing facts

NEEDS_INPUT if:

- the underlying thought is promising
- but a critical fact, mechanism, example, number or context is missing

ARCHIVE if:

- too generic
- too thin
- unsupported
- repetitive
- no useful insight
- purely incidental
- impossible to develop honestly from available evidence

The AI must provide a rationale and missing information where relevant.

Do not use arbitrary numeric scores as the decision mechanism.

==================================================
11. NEEDS INPUT
==================================================

If status = NEEDS_INPUT:

Do NOT draft a post.

Ask exactly ONE highest-value question.

Example:

"The idea is about the pH change in Batch 042. What was the acceptable
pH range for that formulation?"

Set:

status = NEEDS_INPUT
active_note_id = note.id
conversation_state = WAITING_FOR_INPUT

The next relevant Meera response must attach to that note.

After receiving the answer:

→ append the answer as additional evidence
→ do not overwrite the original note
→ re-run idea extraction
→ re-run worthiness

Do not ask the same question repeatedly.

Maximum 3 clarification rounds per note.

If the note still lacks sufficient evidence after 3 rounds:

ARCHIVE with:

"Saved, but there isn't enough information to develop this honestly yet."

==================================================
12. ARCHIVE
==================================================

If status = ARCHIVE:

Do not generate a draft.

Reply:

"Captured. I saved this, but there isn't enough here for a useful post yet."

Store the rationale internally.

The note remains searchable/retrievable.

==================================================
13. DEVELOP
==================================================

Only DEVELOP ideas can enter drafting.

Before drafting:

1. Check for semantic duplication against:
   - previous drafts
   - approved posts
   - published posts
   - active backlog

2. If there is significant overlap:
   flag the overlap.

Do not automatically reject.

A repeated topic can still have a genuinely different angle.

==================================================
14. CURRENT CONTEXT
==================================================

Current context is OPTIONAL.

Never force news into a post.

For DEVELOP ideas, determine whether current external context
would materially strengthen the original idea.

If yes:

research relevant sources.

If no:

draft without current context.

External information must have:

title
publisher
publication date
URL
specific supported claim

Never use:

"studies show"
"experts say"
"research suggests"

without identifying the actual source.

Unverified external information must be marked:

[VERIFY]

A draft containing unresolved [VERIFY] claims is NOT READY_FOR_REVIEW.

If research fails:

do not fail the original note.

Continue without current context.

==================================================
15. DRAFTING
==================================================

The drafting model receives ONLY:

- original note
- transcription, if applicable
- extracted idea
- evidence
- clarification answers
- verified research
- Meera voice skill
- relevant prior content for duplication awareness

The model must not receive unsupported inferred facts as facts.

The draft must be based only on evidence available to the system.

If evidence is insufficient:

return NEEDS_INPUT instead of filling the gap.

==================================================
16. VOICE APPLICATION
==================================================

The voice skill must be passed as the system-level writing instruction.

Do not ask Claude:

"Write a good LinkedIn post."

Ask it to:

"Write a LinkedIn post using the supplied Meera voice skill and only
the supplied evidence."

The skill controls:

format
opening
sentence rhythm
argument structure
scientific explanation
data usage
pronoun discipline
company references
tone
ending
formatting
anti-voice

Do not add generic LinkedIn best practices.

Do not optimise for engagement at the expense of voice.

==================================================
17. DRAFT FORMAT
==================================================

For LinkedIn:

- 7–8 prose paragraphs
- approximately 450–600 words unless the source material genuinely requires otherwise
- no heading
- no bullets
- no numbered list
- no bold
- no emoji
- no hashtag
- no exclamation mark
- no greeting
- no sign-off
- no audience question
- no conventional CTA

Follow the actual voice skill if it contains a more specific rule.

==================================================
18. FACTUAL QA
==================================================

After generation, run a separate factual QA step.

For every substantive factual claim, determine:

SOURCE:
- Meera's original note
- Meera's published material
- verified external source

or:

UNSUPPORTED

Every unsupported factual claim must either:

A. be removed,
B. be marked [VERIFY],
C. cause the draft to return to NEEDS_INPUT.

Do not invent a source.

Do not infer that a source supports a stronger claim than it actually does.

Do not treat an old external statistic in Meera's published material
as automatically reusable.

==================================================
19. VOICE QA
==================================================

Run the supplied voice checklist.

Critical failures include:

- generic hook
- question opening
- fabricated claim
- unsupported number
- marketing language
- conventional CTA
- incorrect formatting
- wrong I/we usage
- unqualified scientific claim
- unverified external claim
- generic skincare-ad language

Maximum TWO automatic revision passes.

After two failed passes:

status = FAILED

Reply:

"I drafted this, but it didn't pass the final checks. I've saved it for review."

Do not endlessly regenerate.

==================================================
20. TELEGRAM REVIEW
==================================================

When status = READY_FOR_REVIEW:

Send:

"Draft ready."

Then send the complete draft.

Then attach exactly these actions:

APPROVE
EDIT
REJECT

Do not send multiple competing drafts.

Do not send internal QA output unless Meera asks for it.

==================================================
21. APPROVE
==================================================

APPROVE:

status = APPROVED

Store:

approved_at
approved_version_id

Reply:

"Approved. I haven't published it."

There is NO LinkedIn publishing integration.

Do not create one.

==================================================
22. EDIT
==================================================

EDIT button:

Set:

conversation_state = WAITING_FOR_EDIT

Reply:

"Send the changes."

The next message is treated as an edit instruction.

Generate a new DraftVersion.

Never overwrite the previous draft.

Store:

version_number
content
created_at
parent_version_id
source = AI_REVISION

Send the revised version with:

APPROVE
EDIT
REJECT

==================================================
23. MEERA'S OWN REWRITE
==================================================

If Meera sends a complete rewritten draft:

Store it as:

source = MEERA
version = MEERA_FINAL

Meera's version is authoritative.

Do not automatically replace it with AI output.

Do not "correct" her writing.

==================================================
24. REJECT
==================================================

REJECT:

Set status = REJECTED.

Ask:

"Why are you rejecting it?"

Provide buttons:

WEAK IDEA
DOESN'T SOUND LIKE ME
WRONG ANGLE
NOT ENOUGH EVIDENCE
TOO PROMOTIONAL
ALREADY COVERED
OTHER

Store the reason.

Do not automatically regenerate.

==================================================
25. CONVERSATION STATE
==================================================

Persist conversation state.

Fields:

telegram_user_id
active_note_id
state
updated_at

States:

IDLE
WAITING_FOR_INPUT
WAITING_FOR_EDIT
WAITING_FOR_REJECTION_REASON

Every state transition must be explicit.

If a user sends an unrelated new note while the bot is waiting for
clarification/edit/rejection:

Do NOT attach it to the old note automatically.

Create a NEW Note.

The old state remains associated with the old note.

This prevents cross-contamination.

==================================================
26. MULTIPLE TELEGRAM MESSAGES
==================================================

Do NOT automatically merge consecutive messages.

Each Telegram message creates its own Note.

If grouping is required, it must be explicit.

For MVP, support:

/append <note_id>

Then the next message is appended as evidence to that note.

Never guess that two messages belong together.

==================================================
27. COMMANDS
==================================================

Implement:

/start
/help
/status
/recent
/drafts
/append <note_id>

Do not implement commands that are not required.

==================================================
28. DUPLICATE MESSAGE PROTECTION
==================================================

Telegram updates can be retried.

Before processing an incoming message:

Check telegram_message_id.

If already processed:

Do nothing.

Never create duplicate Notes or duplicate drafts from the same
Telegram message.

==================================================
29. IDEMPOTENCY
==================================================

AI processing jobs must be safe to retry.

A retry must not:

- create duplicate notes
- create duplicate drafts
- send duplicate Telegram responses
- overwrite previous versions

Use persistent processing states and unique identifiers.

==================================================
30. ERROR HANDLING
==================================================

Never lose the original note.

If any downstream step fails:

preserve the Note
set appropriate FAILED state
log technical error server-side
send a simple Telegram message

Examples:

AI failure:

"I captured the note, but couldn't analyse it right now."

Research failure:

"I couldn't find reliable current context, so I saved the idea without it."

Draft failure:

"I found the idea, but couldn't create the draft. The note is saved."

Do not expose:

exception text
stack trace
API response
API key
prompt
model name
database error

==================================================
31. DATABASE
==================================================

Use SQLite unless the existing application already has a database.

Required entities:

Note
Idea
Evidence
ResearchSource
Draft
DraftVersion
Review
ConversationState

Relationships:

Note
→ Idea
→ Evidence
→ ResearchSource
→ Draft
→ DraftVersion
→ Review

Every Draft must point to its source Note.

Every DraftVersion must point to its parent Draft.

Never delete historical versions.

==================================================
32. TELEGRAM SECURITY
==================================================

Do not log message contents unnecessarily.

Do not log API keys.

Do not expose database IDs to Telegram.

Validate environment variables at startup.

If required environment variables are missing:

fail startup with a clear server-side error.

==================================================
33. .ENV
==================================================

Create:

.env.example

with:

TELEGRAM_BOT_TOKEN=
TELEGRAM_USER_ID=
OPENAI_API_KEY=
ANTHROPIC_API_KEY=

Add:

.env

to .gitignore.

Never hardcode credentials.

==================================================
34. TESTING
==================================================

Implement tests for all critical branches.

Required:

1. Authorized text message.
2. Unauthorized user.
3. Duplicate Telegram message.
4. Authorized voice message.
5. Transcription failure.
6. Strong idea → DEVELOP.
7. Weak idea → ARCHIVE.
8. Incomplete idea → NEEDS_INPUT.
9. Clarification response attaches to correct Note.
10. New unrelated message during WAITING_FOR_INPUT creates a new Note.
11. Current research succeeds.
12. Current research fails without losing note.
13. Unsupported factual claim fails QA.
14. Voice violation fails QA.
15. Draft revision creates a new version.
16. Approve changes status only.
17. Reject stores reason.
18. API failure preserves note.
19. Retry does not duplicate draft.
20. No LinkedIn publishing code exists.

==================================================
35. ACCEPTANCE TEST
==================================================

The build is complete ONLY if this exact scenario works:

STEP 1
Meera sends a voice note.

EXPECTED:
Telegram immediately replies:
"Captured."

STEP 2
Voice is transcribed.

EXPECTED:
Original Telegram message metadata and transcription are stored.

STEP 3
AI analyses the idea.

EXPECTED:
The system classifies it as DEVELOP, NEEDS_INPUT or ARCHIVE.

STEP 4A
If ARCHIVE:

No draft is generated.

STEP 4B
If NEEDS_INPUT:

One precise question is sent.

Meera answers.

The answer is attached to the correct Note.

The idea is re-evaluated.

STEP 4C
If DEVELOP:

The system checks relevant current context.

No context is acceptable if none is relevant.

STEP 5
Draft is generated using meera_voice.txt.

STEP 6
Factual QA runs.

STEP 7
Voice QA runs.

STEP 8
If QA passes:

Telegram receives the draft with:

APPROVE
EDIT
REJECT

STEP 9
Meera presses EDIT.

A new version is created.

STEP 10
Meera presses APPROVE.

Status becomes APPROVED.

STEP 11
The system confirms:

"Approved. I haven't published it."

At NO POINT may the system publish to LinkedIn.

==================================================
36. DEFINITION OF DONE
==================================================

Do not say "done" merely because files were created.

The implementation is complete only when:

- Bot starts successfully.
- Unauthorized users are blocked.
- Text capture works.
- Voice transcription works.
- Notes persist.
- AI classification works.
- NEEDS_INPUT state works.
- ARCHIVE works.
- DEVELOP works.
- Draft generation works.
- Voice QA works.
- Factual QA works.
- Telegram review buttons work.
- Edit versioning works.
- Approval works.
- Rejection works.
- Duplicate updates are handled.
- API failures preserve data.
- No automatic LinkedIn publishing exists.
- Tests pass.

==================================================
37. IMPLEMENTATION ORDER
==================================================

FIRST:
Inspect the repository and identify existing architecture.

SECOND:
Identify the existing voice skill and source files.

THIRD:
Implement database/models.

FOURTH:
Implement Telegram authentication and ingestion.

FIFTH:
Implement voice transcription.

SIXTH:
Implement idea extraction and worthiness.

SEVENTH:
Implement stateful clarification.

EIGHTH:
Implement research.

NINTH:
Implement drafting.

TENTH:
Implement factual QA and voice QA.

ELEVENTH:
Implement Telegram review actions.

TWELFTH:
Implement tests.

THIRTEENTH:
Run the complete acceptance test.

Do not skip directly to draft generation.

==================================================
38. FINAL REPORT
==================================================

After implementation, report ONLY:

1. What already existed.
2. What was changed.
3. Telegram flow.
4. AI pipeline.
5. Database/models.
6. Security/authentication.
7. Tests executed and results.
8. Known limitations.

Do not claim features that were not tested.

Start by inspecting the repository.
