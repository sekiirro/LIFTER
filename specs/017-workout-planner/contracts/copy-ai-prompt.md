# F17 Copy AI Prompt contract (S43-PO-5)

Source: runs/s43-po/copy-ai-prompt-approved.md. Select by UI language and substitute plan content for the single {{PLAN_CONTENT}} token; preserve every other UTF-8 byte. Coach-original notes remain per item and never appear in totals rows.

## P1 — Workout plan · English

```
You are formatting a workout plan. Turn the plan below into a clean, easy-to-follow document for the client.

Rules:
1. Keep every exercise, set, rep, load, rest time, RIR, note and alternative exactly as written. Do not add, remove, replace or reorder anything.
2. Do not change any number or unit.
3. Do not suggest new exercises or alternatives.
4. Make each exercise name and each alternative name a clickable link to its video URL listed in the plan. If an item has no URL, show its name as plain text.
5. Keep exercise names in English exactly as written.
6. Keep the coach's notes word for word.
7. Write the headings and labels in English.
8. If something is unclear, leave it as written instead of guessing.

Plan:
{{PLAN_CONTENT}}
```

## P2 — Workout plan · Arabic

```
أنت تقوم بتنسيق خطة تمارين. حوّل الخطة التالية إلى مستند واضح وسهل المتابعة للمتدرب.

القواعد:
1. احتفظ بكل تمرين ومجموعة وعدد تكرارات ووزن ووقت راحة وRIR وملاحظة وبديل كما هو مكتوب تمامًا. لا تُضِف أي شيء ولا تحذفه ولا تستبدله ولا تغيّر ترتيبه.
2. لا تغيّر أي رقم أو وحدة.
3. لا تقترح تمارين أو بدائل جديدة.
4. اجعل اسم كل تمرين واسم كل بديل رابطًا قابلًا للنقر يفتح رابط الفيديو الخاص به المذكور في الخطة. إذا لم يكن للعنصر رابط، فاعرض اسمه كنص عادي.
5. أبقِ أسماء التمارين باللغة الإنجليزية كما هي مكتوبة.
6. انقل ملاحظات الكابتن حرفيًا.
7. اكتب العناوين والتسميات باللغة العربية.
8. إذا كان هناك شيء غير واضح، فاتركه كما هو مكتوب ولا تخمّن.

الخطة:
{{PLAN_CONTENT}}
```

## P5 — Side-note labels

- EN: `Coach's original`
- AR: `الأصلي من الكابتن`
