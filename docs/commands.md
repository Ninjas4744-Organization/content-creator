# פקודות שימוש

כל הפקודות משורש הריפו, אחרי `python3 scripts/setup.py`. ב־Windows החליפו `.venv/bin/python` ב־`.venv\Scripts\python.exe`.

## פרויקט חדש

```sh
.venv/bin/python -m davinci_creator new my-training --title "ההכשרה הבאה שלנו"
.venv/bin/python -m davinci_creator check projects/my-training/content.json
.venv/bin/python -m davinci_creator deck projects/my-training/content.json --out projects/my-training/output/deck
```

ערכו קודם את הבריף והתוכן. פקודת `new` מסרבת לדרוס פרויקט קיים. `check` בודקת גם התאמת טקסט לפריסה. `deck` מפיקה PPTX, HTML ותיקיית previews; השקפים ניתנים להדפסה ל־PDF מתוך HTML דרך הדפדפן. בהצגה: חץ שמאלה/רווח לשקף הבא, חץ ימינה לקודם, N להערות.

## תמונות מאלבומי הקבוצה

```sh
.venv/bin/python -m davinci_creator photos albums
.venv/bin/python -m davinci_creator photos catalog season-2026
.venv/bin/python -m davinci_creator photos import season-2026 --limit 12
```

אפשר גם להעביר קישור Google Photos משותף במקום מזהה אלבום. הקטלוג מאפשר בחירה חזותית; הייבוא שומר תמונות מקומיות, פרטי מקור ו־storyboard. בחירה לפי מזהה, הגדרות איכות ושימוש בשדה `image`: [מדריך אלבומי התמונות](photos.md).

## סרטון דוגמה עם הקריינות שכבר קיימת

```sh
.venv/bin/python -m davinci_creator video examples/community/content.json --voices examples/community/voices --out outputs/community-video
```

ברירת המחדל היא 720p ו־30fps. ל־1080p הוסיפו `--width 1920`. אפשר לשנות `--workers 1` אם המחשב עמוס. הרינדור יכול להימשך כמה דקות בהתאם למשך ולמחשב.

התוצר כולל `video.mp4`, `timeline.json`, `captions.srt`, תצוגות מקדימות, קובצי קול בתיקיית `audio/` ונגן ב־`interactive/`. הדוגמה שאושרה בשיחה זמינה גם ב־`examples/community/approved-video.mp4`; היא עוצבה ידנית לפני כלי הפריסה הכללי, ולכן בנייה חדשה אינה זהה לה פריים לפריים.

## טיוטת אנימציה מהירה

```sh
.venv/bin/python -m davinci_creator video projects/my-training/content.json --out projects/my-training/output/draft --draft --seconds 4 --width 640 --fps 12
```

טיוטה כוללת מוזיקה ואפקטים, ללא דיבור, ומסומנת DRAFT. `--limit 2` מאפשר לבדוק רק שתי סצנות. יצוא רגיל מסרב להשתמש בקריינות חסרה או שאינה תואמת לטקסט.

## קריינות חדשה דרך Gemini

```sh
.venv/bin/python -m davinci_creator tts projects/my-training/content.json --key-file /path/to/private/gemini-key
.venv/bin/python -m davinci_creator video projects/my-training/content.json --out projects/my-training/output/video
```

אפשר להגדיר `GEMINI_API_KEY` במקום `--key-file`. ברירת המחדל: `gemini-3.8-flash-tts`. כשמשתמשים ב־`--model`, העבירו את אותו מודל גם ל־`tts` וגם ל־`video`. קובצי המטמון ברירת המחדל נמצאים ב־`audio/voices/` לצד התוכן; תיקיות הקול שנוצרות בפרויקטים מוחרגות מ־Git. מחיקת קובץ אינה דורשת יצירה מחדש של כל שאר הקולות.

## נגן לסרטון שכבר קיים

```sh
.venv/bin/python -m davinci_creator player examples/community/approved-timeline.json --video examples/community/approved-video.mp4 --out outputs/approved-interactive
.venv/bin/python -m davinci_creator serve outputs/approved-interactive
```

פתחו `http://127.0.0.1:8000/`. השרת נגיש למחשב המקומי בלבד. לעצירה: Ctrl+C. ליצירת נגן לסרטון חדש השתמשו ב־`timeline.json` שהרינדור שלו הפיק. אל תשנו תזמון בלי להתאים אותו לווידאו.

## ייצוא SCORM למערכות למידה

```sh
.venv/bin/python -m davinci_creator scorm examples/community/content.json --out projects/scorm-pilot/output/slides
.venv/bin/python -m davinci_creator scorm examples/community/approved-timeline.json --format video --video examples/community/approved-video.mp4 --out projects/scorm-pilot/output/video
```

כל פקודה מפיקה `lesson.zip` להעלאה כפריט תוכן SCORM. הפעילו שמירת התקדמות במטלה ובחרו כלל השלמה שממתין לדיווח מהלומדה. הוראות, כללי סיום ובדיקה מקומית: [מדריך SCORM](scorm.md).

## בדיקות ותחזוקה

```sh
.venv/bin/python -m davinci_creator doctor
.venv/bin/python -m unittest discover -s tests -v
python3 scripts/sync_skills.py --check
```

`doctor` בודקת גופנים, תמונות והפעלת FFmpeg. אם יש FFmpeg מקומי מותאם, הגדירו `FFMPEG_PATH`. הכתוביות מקבלות תזמון משוער לפי קבוצות מילים ואורך ההקלטה, ויש לדייק אותן ידנית כשנדרש תזמון מדויק. ספריית תמונות המצגת וה־storyboard הן בדיקת פריסה משותפת; רצוי לבדוק PPTX גם ביישום ההקרנה עצמו.

## הורדה ושמירת מקורות ב־R2

`projects/` היא תיקיית עבודה מקומית מוחרגת מ־Git. לעריכת פרויקט קיים:

```sh
.venv/bin/python -m davinci_creator projects list
.venv/bin/python -m davinci_creator projects pull my-training
.venv/bin/python -m davinci_creator projects push my-training
```

הוראות לגרסאות, נכסי מקור ומניעת דריסת עריכות נמצאות ב־[מדריך המקורות](project-sources.md).
