# מקורות הנכסים

| תיקייה | מקור ותפקיד |
| --- | --- |
| `brand/` | הלוגואים והרקעים שסופקו על ידי המשתמש עבור Da Vinci 4744. |
| `brand/Rubik-*.ttf` | הגופנים שסופקו עם המיתוג. רישיון SIL Open Font License המקורי נמצא ב־`Rubik-OFL.txt` ויש לשמור אותו בהפצה. |
| `photos/` | תמונות הקבוצה והרובוט שחולצו ממצגת הייחוס שסופקה. |
| `photo-albums.json` | שלושת אלבומי Google Photos המשותפים שסיפק המשתמש ב־28.10.2026. המקורות זמינים דרך פקודות `photos`; הוראות ב־`docs/photos.md`. |
| `photos/albums/` | עותקים מקומיים מיובאים מהאלבומים, מוחרגים מ־Git. מניפסט בכל אלבום מתעד קישור מקור ו־SHA-256. לשימוש בתוצרי הקבוצה לפי בקשת המשתמש, ללא רישיון הפצה כללי. |
| `reference/` | `DaVinci-Visual-Reference.pdf`, דוגמת העיצוב המקורית שסופקה. |
| `manifest.json` | רשימת קבצים עם גדלים ו־SHA-256 לבדיקת שלמות. |

הכללת לוגואים, תמונות ומסמך הייחוס מיועדת לעבודת הקבוצה לפי בקשת המשתמש. היא אינה מעניקה רישיון כללי לשימוש במיתוג או בזכויות של צד שלישי. זכויות הגופן נשארות לפי רישיונו המצורף. לא נבחר עדיין רישיון הפצה כללי לקוד הריפו.

הקריינות בדוגמת הקהילה נוצרה באמצעות Gemini TTS בקולות Kore ו־Puck. פרטי המקור והמטמון נמצאים ב־`examples/community/voice-provenance.json` וב־`voices/manifest.json`. המוזיקה והאפקטים בתהליך היצירה נוצרים מקומית בקוד ואינם דורשים הורדת קובצי אודיו נוספים.

לנכס חדש ציינו כאן מאין הגיע, מה מותר לעשות בו ובאיזה תוצר משתמשים בו. אין להוסיף מפתחות API או חומר פרטי כחלק מנכסי הדוגמה.

| נכסים נוספים | מקור ושימוש |
| --- | --- |
| `illustrations/physics-forces-exam/*.png` | 24 תרשימי פיזיקה מקוריים שנוצרו בקוד `projects/physics-forces-exam/build_video.py` ב־28.10.2026: חצים, קפיצים, גרפים ותרשימי כוחות. משמשים בסרטון החזרה למבחן ובמצגת המלווה. אין העתקה של איורי הספר; נתוני הניסויים להמחשה בלבד. |
| `training/library-guide/home.png`, `search.png`, `viewer.png`, `export.png` | צילומי ממשק מהספרייה הציבורית ב־https://knowledge.davinci4744.com/, בתצוגת חלון צר, 26.10.2026. משמשים בסרטון ההיכרות; הממשק והתוכן שייכים לפרויקט Da Vinci 4744. |
| `training/library-guide/export-scorm.jpg` | צילום חלון ייצוא SCORM באתר knowledge.davinci4744.com ב־29.10.2026, עבור עדכון סרטון ההיכרות. צילום ממשק הפרויקט, עם פורמט סרטון נבחר. |
| `recruitment/team.jpg`, `first.png`, `join-qr.png` | תמונת הקבוצה, סמל FIRST וקוד ההצטרפות שחולצו ממצגת הגיוסים שסיפק המשתמש. משמשים במצגת הגיוסים בלבד; המקור נשמר ב־`projects/recruitment/source/recruitment.pptx`. |
| `recruitment/{software,field,electrical,leadership,mechanics,engineering,media}.{svg,png}` | סמלי התחומים מתוך קובצי ה־SVG במצגת המקורית. קובצי PNG רונדרו מה־SVG על רקע שקוף, ללא שינוי בצורות וללא יצירת סמלים חלופיים. לשימוש במצגות הקבוצה בהתאם לבקשת המשתמש. |
| `recruitment/technology-unit-{1,2,3}.png`, `learning.gif` | שלושת סמלי היחידות והאנימציה בת 20 השניות מתוך מצגת הגיוסים המקורית. הקבצים נשמרו ללא שינוי; החיתוך של האנימציה מוגדר בפריסה, כפי שהיה במקור. |
| `team-selection/questionnaire-qr.png` | קוד QR שנוצר מקומית עבור קישור השאלון שסיפק המשתמש ב־28.10.2026. משתמש בלוגו וב־wordmark המקומיים, באותו עיצוב של מצגת הגיוסים. המקור והאימות נמצאים ב־`projects/team-selection/output/qr/`; לשימוש במצגת בחירת הצוותים. |
| `projects/yakam-team-meeting/dropbox-story.mp4`, `dropbox-story-poster.png`, `dropbox-story.vtt` | סרטון ואיורים מונפשים מקוריים שנוצרו בקוד `projects/yakam-team-meeting/dropbox-story/build_video.py` עבור השקף השני במצגת יק״ם, ב־29.10.2026. קריינות Gemini בקולות Kore ו־Puck, מוזיקה מקורית מהמנוע המשותף וגופני Rubik המקומיים. הנתונים ההיסטוריים מיוחסים למצגת מייסד Dropbox מ־2010, כפי שמפורט במקורות הפרויקט. אין שימוש בצילומי ממשק או באיורי מוצר של Dropbox. הנכסים נשמרים בארכיון המקורות לצורכי הקבוצה; לא נקבע להם רישיון הפצה כללי. |
# Project source assets

Project-specific images and source attachments are stored with their editable project archives in R2. Restore them with `scripts/project_store.py pull <id>`; they remain in ignored local asset folders. Shared brand assets and example photos stay in Git. Project archives retain source attribution records alongside their files. See [project source recovery](../docs/project-sources.md).
