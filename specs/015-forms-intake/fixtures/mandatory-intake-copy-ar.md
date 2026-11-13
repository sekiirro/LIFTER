SECTION 01 — البيانات الأساسية (5 Questions)

1. الاسم الثلاثي

- Type: Read-only Text Input.
- Auto-fill from Sign Up.
- Enforce at least 3 name components during registration.

2. العمر

- Type: Read-only Number.
- Auto-calculate from registered Date of Birth.

3. عندك أي أمراض مزمنة؟

- Type: Yes/No Radio Cards.
- If Yes, reveal a Long Text field: «اكتب تفاصيل الأمراض المزمنة اللي عندك».

4. وزنك الحالي كام؟

- Type: Numeric Input.
- Unit: kg.

5. إيه وظيفتك؟

- Type: Short Text Input.
- Do NOT ask about daily activity here.

SECTION 02 — التمرين (8 Questions)

1. إيه هدفك على المستوى القريب؟

- Type: Single-choice Cards + «هدف آخر» with conditional Text Input.
- Do not invent unapproved goal options.

2. عندك أي إصابة؟

- Type: Yes/No Radio Cards.
- If Yes, reveal Long Text: «احكيلنا تفاصيل الإصابة».

3. حابب تتمرن كام يوم في الأسبوع؟

- Type: Single-choice Cards.
- Options: 2–6 days.

4. تقدر تخصص وقت قد إيه للتمرينة؟

- Type: Two Selectable Cards.
- «أقل من ساعة ونص»
- «ساعة ونص أو أكتر»

5. بتلعب أي رياضة بجانب الجيم؟

- Type: Yes/No.
- If Yes, show: «إيه الرياضة اللي بتلعبها؟» — Text Input.

6. شايف إيه نقاط ضعفك؟

- Type: Long Textarea.

7. إيه أكتر تمارين بتحبها وإيه أكتر تمارين بتكرهها؟

- Type: Two separate Text Inputs.
- «التمارين اللي بتحبها»
- «التمارين اللي بتكرهها»

8. عايز نظام تمرين معين؟

- Type: Yes/No.
- If Yes, show: «إيه نظام التمرين اللي حابب تمشي عليه؟» — Text Input.

SECTION 03 — التغذية (12 Questions)

1. إيه هدفك من النظام الغذائي؟

- Type: Five Premium Single-select Cards.
- Each card displays its Arabic title and description:

تنشيف
«خسارة دهون بمعدل متوسط مع الحفاظ على أكبر قدر ممكن من الكتلة العضلية».

تنشيف سريع
«خسارة دهون بمعدل أسرع، مع احتمالية أعلى لفقدان عضلات أو التأثير على الأداء».

تضخيم
«زيادة الكتلة العضلية مع تقليل اكتساب الدهون قدر الإمكان».

تضخيم سريع
«زيادة الوزن والكتلة العضلية بمعدل أسرع، مع احتمالية اكتساب دهون أكتر».

إعادة تشكيل الجسم
«زيادة الكتلة العضلية مع تقليل نسبة الدهون في نفس الوقت».

2. طولك كام بالسنتيمتر؟

- Type: Numeric Input.
- Unit: cm.

3. مستوى نشاطك وحركتك خلال اليوم عامل إزاي؟

- Type: Single-choice Radio Cards.
- Options:
  - «أغلب اليوم قاعد»
  - «حركة ومشي خفيف»
  - «حركة ومشي متوسط»
  - «حركة كتير أو شغل بدني مجهد»
- Refers to daily activity outside exercise.

4. عندك حساسية من أكل معين؟

- Type: Yes/No.
- If Yes, show: «اكتب الأكلات اللي عندك حساسية منها» — Textarea.

5. بتستخدم أدوية أو مكملات حاليًا؟

- Type: Yes/No.
- If Yes, show: «اكتب أسماء الأدوية والمكملات اللي بتستخدمها» — Textarea.
- If No, show: «تحب نقترح عليك مكملات غذائية؟» — Yes/No.
- Do not automatically prescribe supplements.

6. احكيلي يوم أكلك المعتاد عبارة عن إيه؟

- Type: Long Textarea.

7. حابب تاكل كام وجبة في اليوم؟

- Type: Single-choice Cards.
- Options: «وجبتين» / «3 وجبات» / «4 وجبات» / «5 وجبات» / «6 وجبات أو أكتر».
- For 6+, allow entering the exact number.
- After selection, dynamically show:
  «تحب تمرينك يكون بعد الوجبة الكام؟»
- Type: Dynamic Single-choice.
- Generate meal-number options based on the selected meal count.
- Additional options: «قبل أول وجبة» / «معنديش ميعاد ثابت».

8. ميزانيتك للأكل عاملة إزاي؟

- Type: Three Single-select Cards.
- Selecting a budget reveals Multi-select Food Chips:

ميزانية قليلة
«جبنة قريش» / «بروتين نباتي» / «بيض» / «عيش بلدي»

ميزانية متوسطة
«بيض» / «فراخ» / «لحمة» / «توست» / «سمك»

ميزانية عالية
«سالمون» / «تركي مدخن» / «ستيك» / «ريب آي»

- Allow multiple food selections. Food lists must remain editable in Form Builder.

9. إيه أكتر أكل بتحبه وإيه أكتر أكل بتكرهه؟

- Type: Two separate Text Inputs.
- «الأكل اللي بتحبه»
- «الأكل اللي بتكرهه»

10. تحب توزن أكلك قبل الطبخ ولا بعده؟

- Type: Three Single-choice Cards.
- «قبل الطبخ»
- «بعد الطبخ»
- «معنديش تفضيل»

11. بتقيّم إحساسك بالجوع كام من 10؟

- Type: PREMIUM Interactive Slider.
- Range: 0–10, step 1.
- Large animated live score displayed as X/10.
- Smooth motion, Emerald accent from DESIGN.md, mobile touch support, keyboard and screen-reader accessibility.
- Show Arabic labels:
  - 0 — «مش بجوع تقريبًا»
  - 5 — «جوع متوسط»
  - 10 — «جوع شديد جدًا»
- Dynamic feedback below slider:
  - 0–2: «إحساس قليل جدًا بالجوع»
  - 3–4: «جوع خفيف»
  - 5–6: «جوع متوسط»
  - 7–8: «جوع مرتفع»
  - 9–10: «جوع شديد جدًا»

12. اختار أقرب نسبة دهون لشكل جسمك

- Type: Visual Single-select Image Cards.
- Reuse existing Body Fat Reference Asset.
- Display the estimated percentage associated with each image.
- This MUST be the LAST Nutrition question.
- Show: «النسبة دي تقديرية ومش بديل عن قياس نسبة الدهون».
