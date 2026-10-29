# מקורות הפרויקטים ב־R2

הריפו מכיל את כלי היצירה, האתר, המיתוג, התבניות ודוגמת שימוש. `projects/` היא סביבת
עבודה מקומית שמוחרגת מ־Git. מקורות הפרויקטים והקבצים הייעודיים שלהם נשמרים ב־R2
בחבילות ZIP עם גרסאות לפי SHA-256. התוצרים לצפייה נשמרים בנפרד בקטלוג הגלריה.

## התחברות

פקודות המקורות משתמשות בחיבור Wrangler הקיים, בלי לייצא מפתחות או לשמור אותם בפרויקט.
אחרי התקנת סביבת Python, מתקינים את כלי Cloudflare ומתחברים לפי הצורך:

```sh
npm --prefix learning-library/cloudflare ci
cd learning-library/cloudflare
npx wrangler login
cd ../..
```

ברירת המחדל היא ה־bucket המוגדר לפרויקט: `davinci-learning-library`.
אפשר לבחור bucket אחר באמצעות `--bucket` או `R2_BUCKET`.

## בחירת פרויקט והורדה לעריכה

```sh
.venv/bin/python -m davinci_creator projects list
.venv/bin/python -m davinci_creator projects pull my-training
```

אפשר להשתמש גם ב־`.venv/bin/python scripts/project_store.py` עם אותם ארגומנטים.
ההורדה משחזרת את המקורות ל־`projects/my-training/` ואת התמונות התלויות בהם למיקומן
המקורי תחת `assets/`. קבצים קיימים שזהים למקורות נשמרים. אם קובץ מקומי שונה, ההורדה
נעצרת לפני התקנת קבצים חדשים, כדי לשמור על העריכות המקומיות.

אפשר להוריד עותק להשוואה בסביבת עבודה אחרת:

```sh
.venv/bin/python -m davinci_creator projects --workspace /tmp/my-training-review pull my-training
```

לאחר ההורדה עורכים את `content.json`, הבריף והסקריפטים כרגיל. מצגות יכולות להיבנות
בלי שירות קריינות. יצירת קריינות חדשה עדיין מחייבת Gemini; מטמון הקריינות שנוצר מקומית
ותוצרי ביניים אינם חלק מחבילת המקורות. אם קיימת תיקיית `tests/` בפרויקט, אפשר להריץ את
בדיקותיו עם `python -m unittest discover -s projects/my-training/tests`.

## שמירת גרסה

```sh
.venv/bin/python -m davinci_creator projects push my-training
```

הפקודה אורזת את המקורות, מעלה את החבילה, מורידה אותה בחזרה, מאמתת את התוכן ומנסה
שחזור מלא בתיקייה זמנית. רק לאחר מכן היא מעדכנת את קטלוג המקורות. גרסאות קודמות
נשמרות, והקבצים המקומיים נשארים במקומם. העלאת מקורות אינה מפרסמת שיעור בגלריה.

הריצו מפרסם מקורות אחד בכל פעם. שינוי שהכלי מזהה בקטלוג בזמן ההעלאה עוצר את עדכונו;
גם עריכה שהתבססה על גרסה ישנה דורשת קודם שילוב עם הגרסה העדכנית. החיבור המקומי
ל־Wrangler אינו מספק פעולת compare-and-swap לקטלוג.

לשחזור גרסה קודמת:

```sh
.venv/bin/python -m davinci_creator projects list --versions
.venv/bin/python -m davinci_creator projects --workspace /tmp/previous-version pull my-training --version SHA256
```

## מה נשמר

החבילה כוללת בריפים, JSON, תמלילים, מסמכי מקור, סקריפטים, משאבי הפרויקט ובדיקות
ייעודיות. הפניות לתמונות מקומיות ב־JSON נאספות אוטומטית. קבצים נוספים או תיקיות
שסקריפט מייצר או טוען דינמית נרשמים ב־`projects/my-training/publication.json`:

```json
{
  "category": "הכשרות",
  "gallery": "public",
  "source_assets": ["assets/projects/my-training"]
}
```

`publication.json` מכיל גם את כותרת הגלריה, התיאור וסימוני `featured` ו־`unlisted`.
הוא משוחזר עם הפרויקט; אין עוד תלות ברשימת פרויקטים בתוך Git. נכסים ייעודיים חדשים
מומלץ לשמור תחת `assets/projects/<id>/`, שגם היא תיקייה מקומית מוחרגת.

תיקיות תוצרים, מטמונים, קבצים מוסתרים וקובצי אישורים אינם נארזים. סודות מזוהים ב־JSON
עוצרים את האריזה בלי להדפיס את ערכיהם. החבילה מכילה manifest עם גודל ו־SHA-256 לכל
קובץ. בשחזור נדחים נתיבים חורגים, קישורים סימבוליים, קבצים לא צפויים וחבילות גדולות מדי.

המקורות נשמרים תחת `project-sources/` ואינם מוגשים דרך האתר הציבורי. הורדתם דורשת
גישה ל־R2 דרך Wrangler. הפרסום לצופים מוסבר ב־[מדריך הגלריה](gallery.md).
