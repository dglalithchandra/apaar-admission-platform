# Institution operator usability study

Status: prepared, not conducted. On 28 October 2026 the project owner deferred recruitment. Sessions remain at zero; no participant results or measured benefits are claimed.

## Purpose and participants

Observe 3�5 admissions operators across institution types using only synthetic records. Participation is voluntary. Record institution type and relevant experience, not names, employer names or contact details in the repository. A small convenience sample identifies usability problems; it is not a representative national satisfaction survey.

## Before the session

Check the local deployment, prepare a fresh isolated synthetic institution and save the build commit, browser, viewport and machine specification. Do not reset shared state. Tell the participant this evaluates the software, not their job performance. Explain what will be recorded and ask permission separately for screen/audio recording. Keep signed forms and recordings outside Git. Use no real student information.

## Tasks (20�30 minutes)

1. Without coaching, find the correct upload template and explain the file limits.
2. Upload the valid synthetic fixture. Find the receipt and explain which rows succeeded.
3. Upload the error fixture. Identify one correctable error and explain the next action.
4. Export corrections and retry safely. Explain whether previously accepted rows will consume another seat.
5. Inspect a duplicate-identity or overlap result. Explain why it is blocked or needs review. Do not tell the participant the expected answer first.
6. Inspect a provider outage. Distinguish unavailable identity verification from a rejected student.
7. Find the history needed to explain an admission decision to a reviewer.

If a task cannot be completed in the current build, record blocked_by_product rather than counting it as a user failure. Stop a task after five minutes; offer assistance and record it. Use the same fixture and instructions for every participant.

## Baseline comparison

Ask participants to describe or demonstrate their normal process with a fictional equivalent. Obtain their authorisation for any view of institutional software and redact sensitive material before recording. When direct observation is unavailable, record self_reported, never observed. Alternate which system is shown first where possible. Do not claim a percentage improvement from incomparable tasks or recalled times.

## Measures

For each task record elapsed seconds, completion (unassisted/assisted/failed/blocked_by_product), number of moderator interventions, errors, and participant explanation. Record the raw task results before calculating aggregates. Distinguish system waiting time from operator work. Summarise median times and observed counts with denominators; disclose the small sample and recruitment method.

## Moderator prompts

�What would you do next?� �What do you think this result means?� �What information is missing?� Avoid directing attention to the correct control. Ask after each task: �How difficult was that task, from 1 very easy to 7 very difficult?� End with the three most confusing aspects and the one change they would prioritise.

## Participation consent (read aloud)

You are invited to evaluate an independent synthetic admission-record prototype. Participation is voluntary; you may stop or skip a task without giving a reason. We will record task outcomes and anonymised comments. No real student records or credentials should be entered. Recording the screen or voice requires your separate permission. Tell the organiser before the anonymised analysis is finalised if you want your session removed. Confirm the agreed retention period, contact and withdrawal deadline before starting; do not invent those terms on a participant's behalf.

## Reporting rules

Preserve unfavourable results. Label quotes anonymous and omit identifying details. Publish recruitment, date, commit, conditions, exclusions, raw denominators and limitations. Obtain separate permission before using identifiable quotes or recordings publicly. Leave findings unreported until sessions occur.
