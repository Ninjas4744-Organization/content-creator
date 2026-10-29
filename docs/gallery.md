# ספריית הלמידה

האתר נמצא בתיקיית `learning-library/` בשורש הריפו ומתפרסם ב־Cloudflare בכתובת
[knowledge.davinci4744.com](https://knowledge.davinci4744.com/). קוד האתר וכלי היצירה
נשמרים ב־Git; התכנים לפרסום והקטלוג נשמרים ב־R2. האתר טוען את הקטלוג בזמן פתיחת
הגלריה. פרסום שיעור חדש אינו מחייב בנייה או פריסה מחדש של האתר.

## הרצה ובנייה

```sh
npm --prefix learning-library ci
npm --prefix learning-library start
npm --prefix learning-library run build
```

בניית האתר מעתיקה רק נכסי מותג ויוצרת קטלוג ריק לפיתוח מקומי. היא אינה סורקת את
`projects/`, אינה מרנדרת סרטונים ואינה צריכה Python או גישה ל־R2.
בייצור, ה־Worker מגיש את `/library/catalog.json` ואת קובצי השיעורים מתוך ה־bucket.
האתר הבנוי נמצא ב־`learning-library/output/site/`.

לתצוגה מקומית עם שיעור שהוכן מראש:

```sh
.venv/bin/python scripts/prepare_gallery.py --project my-training
LIBRARY_PREVIEW_DIR="$PWD/learning-library/output/content/library" npm --prefix learning-library start
```

אין להגדיר `LIBRARY_PREVIEW_DIR` בפריסת ייצור: התוכן מגיע שם מ־R2.
לבדיקת ה־Worker מקומית, בונים את האתר, מריצים `prepare:content` בתיקיית `cloudflare/`
ואז `npm run dev` באותה תיקייה. ברירת המחדל משתמשת באחסון R2 מקומי ומבודד.

## יצירה ופרסום תוכן

מקורות השיעורים נשמרים ב־`projects/<id>/content.json`. כותרות תצוגה, תיאורים,
קטגוריות וסימון `featured` או `unlisted` נשמרים ב־`projects/library.json`.
קבצים חדשים ב־R2 אינם הופכים אוטומטית לכרטיס: כלי הפרסום מוסיף רשומה לקטלוג רק אחרי
שהקבצים הדרושים קיימים ונבדקו. אפשר לפרסם גם תכנים שנוצרו מחוץ לריפו, באמצעות חבילת
פרסום שתואמת למבנה `catalog.json`, `media/` ו־`exports/`.

אחרי יצירת סרטון, שומרים חבילת נגן מקומית לפרסום:

```sh
.venv/bin/python scripts/prepare_gallery.py \
  --publish-video my-training \
  --from projects/my-training/output/video/interactive \
  --publish-only
.venv/bin/python scripts/prepare_gallery.py --project my-training
.venv/bin/python scripts/publish_library.py --dry-run
.venv/bin/python scripts/publish_library.py
```

חבילות נגן נשמרות במטמון מקומי תחת `learning-library/output/published/`, שמוחרג מ־Git.
תוצרי הפרסום נוצרים ב־`learning-library/output/content/`.
יש לבדוק את התוכן, הווידאו והקריינות לפני הפרסום. פרטי ההתקנה וההרשאות במדריך
[Cloudflare ו־R2](cloudflare.md).

כל פרסום מעלה גרסה חדשה, מאמת את הקבצים ומעדכן את הקטלוג בסיום. עדכון שיעור קיים
שומר את מזהה הפרויקט ואת הקישורים הישירים לגלריה. התקדמות מקומית בנגן נשמרת לפי
מזהי השיעור; חבילות SCORM עצמאיות כוללות את המדיה בתוך ZIP ומדווחות למערכת הלמידה.

## גלריות וקישורים

הגלריה הציבורית מציגה תכנים שאינם מסומנים `unlisted`. הנתיב `/team-library/` מציג
תכנים מסומנים, ואינו מקושר מתוך הגלריה הציבורית. זו הסתרה מתצוגה, ולא הגנת הרשאות:
הקטלוג ציבורי וכל מי שמחזיק בקישור יכול לצפות ולשתף.

קישור ישיר לשיעור נשאר בצורה `?item=<project-id>&view=deck` או `view=video`.
נגן הווידאו כולל פרקים, חיפוש בתמליל, שאלות ושמירת התקדמות. דיאלוג הייצוא מאפשר
להוריד חבילות SCORM למצגת ולסרטון, לפי הפורמטים הזמינים באותו שיעור.

## מבנה הקוד

- `learning-library/app/`: נתיבי הגלריות ומסמך HTML.
- `learning-library/src/`: הקטלוג, חיפוש וסינון, צפייה וייצוא.
- `learning-library/cloudflare/`: הגשת האתר ותוכן R2 והפניית הדומיין הישן.
- `scripts/prepare_gallery.py`: הכנת שיעורים שנבחרו במפורש.
- `scripts/publish_library.py`: העלאה, אימות ועדכון קטלוג ב־R2.
- `scripts/prepare-gallery.mjs`: נכסי האתר לפיתוח ולבנייה, ללא שיעורים.

בדיקות: `npm --prefix learning-library test`, בדיקות TypeScript ופורמט, בדיקות Worker
ובדיקות Python. הוראות פריסה מלאות מופיעות במדריך Cloudflare.
