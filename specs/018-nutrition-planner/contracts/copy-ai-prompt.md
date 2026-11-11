# F18 Copy AI Prompt contract (S43-PO-5)

Source: `runs/s43-po/copy-ai-prompt-approved.md`, held in the S43 PO run archive outside this checkout (5,272 bytes, SHA-256 `cc388b80c3cb6dbac76af47562f47710d0f08d726a5d1e976d9f1ab77b421e03`). To verify, extract the fenced bodies of P3 (English) and P4 (Arabic) plus the P5 labels from that file and compare them byte-for-byte with this contract; they must be identical. If the archive is unavailable, obtain the file from the PO before editing this contract and never retype the bodies. Select by UI language and substitute plan content for the single {{PLAN_CONTENT}} token; preserve every other UTF-8 byte. The client selection is primary; show coach-original per affected item and never in totals rows.

## P3 — Nutrition plan · English

```
You are formatting a nutrition plan. Turn the plan below into a clean, easy-to-follow document for the client.

Rules:
1. Keep every day, meal, food, quantity, unit, calorie value, macro value, note, alternative and recipe or preparation link exactly as written. Do not add, remove, replace or reorder anything.
2. Do not change, round or recalculate any number. Use the totals exactly as provided.
3. Do not suggest new meals, foods or alternatives.
4. Where the client chose an approved alternative, show the client's choice as the main item and show the coach's original item next to it as a note labeled "Coach's original". Do not show the coach's original in any totals row.
5. Make each recipe or preparation link clickable. If an item has no link, show it as plain text.
6. Keep the coach's notes word for word.
7. Write the headings and labels in English.
8. If something is unclear, leave it as written instead of guessing.

Plan:
{{PLAN_CONTENT}}
```

## P4 — Nutrition plan · Arabic

```
أنت تقوم بتنسيق خطة تغذية. حوّل الخطة التالية إلى مستند واضح وسهل المتابعة للمتدرب.

القواعد:
1. احتفظ بكل يوم ووجبة وصنف طعام وكمية ووحدة وقيمة سعرات وقيمة مغذيات وملاحظة وبديل ورابط وصفة أو تحضير كما هو مكتوب تمامًا. لا تُضِف أي شيء ولا تحذفه ولا تستبدله ولا تغيّر ترتيبه.
2. لا تغيّر أي رقم ولا تقرّبه ولا تُعِد حسابه. استخدم المجاميع كما هي مكتوبة تمامًا.
3. لا تقترح وجبات أو أطعمة أو بدائل جديدة.
4. إذا اختار المتدرب بديلًا معتمدًا، فاعرض اختياره كعنصر رئيسي، واعرض العنصر الأصلي الذي حدده الكابتن بجانبه كملاحظة بعنوان "الأصلي من الكابتن". لا تعرض العنصر الأصلي للمدرب في أي صف من صفوف المجاميع.
5. اجعل كل رابط وصفة أو تحضير قابلًا للنقر. إذا لم يكن للعنصر رابط، فاعرضه كنص عادي.
6. انقل ملاحظات الكابتن حرفيًا.
7. اكتب العناوين والتسميات باللغة العربية.
8. إذا كان هناك شيء غير واضح، فاتركه كما هو مكتوب ولا تخمّن.

الخطة:
{{PLAN_CONTENT}}
```

## P5 — Side-note labels

- EN: `Coach's original`
- AR: `الأصلي من الكابتن`
