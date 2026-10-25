"""Apply the requested simple component/function brief."""
import json
from pathlib import Path
p=Path(__file__).parent
scene_data=[
('opening','cover','מכירים את רכיבי\nהחשמל ברובוט','female','ברובוט יש הרבה חוטים וקופסאות, אבל לכל רכיב יש תפקיד פשוט. בואו נכיר את הרכיבים העיקריים ברובוט אף אר סי: איך קוראים להם, ומה כל אחד עושה. בדרך נענה על שתי שאלות.'),
('battery','cards','סוללה — מקור האנרגיה','male','נתחיל בסוללה. היא שומרת את האנרגיה שהרובוט צריך כדי לפעול, כמו סוללה של צעצוע, רק גדולה וחזקה יותר. היא מספקת חשמל למנועים, למחשב ולשאר הרכיבים. בלי סוללה מחוברת וטעונה, הרובוט לא יעבוד.'),
('main-breaker','cards','מפסק ראשי — הדלקה וכיבוי','female','המפסק הראשי הוא מתג ההדלקה והכיבוי של מערכת החשמל. כשמכבים אותו, מנתקים את החשמל שמגיע מהסוללה לשאר הרובוט. הוא גם מספק הגנה כשזורם יותר מדי זרם. זה רכיב שכדאי לדעת לזהות מיד.'),
('power-distribution','cards','לוח חלוקה — חשמל לכולם','male','לוח חלוקת החשמל מקבל חשמל מהסוללה ומחלק אותו לרכיבים השונים. אפשר לחשוב עליו כמו מפצל עם הרבה יציאות. לכל ענף יש הגנה מתאימה. שמות נפוצים שתשמעו בקבוצה הם פי די אייץ׳ ופי די פי.'),
('motor-controller','cards','בקר ומנוע — שולטים וזזים','female','המנוע הוא הרכיב שיוצר תנועה: מסובב גלגל או מרים זרוע. בקר המנוע קובע איך המנוע יפעל, למשל באיזה כיוון ובאיזו עוצמה. לפעמים הבקר הוא קופסה נפרדת, ולפעמים הוא כבר מובנה בתוך המנוע עצמו.'),
('question-one','statement','שאלה 1 מתוך 2','male','זמן לשאלה קצרה: איזה רכיב מספק לרובוט את האנרגיה שלו? הסוללה, הרדיו או המצלמה? בחרו תשובה בנגן. אחרי הבחירה נמשיך להכיר את שאר הרכיבים.'),
('robot-brain','cards','מחשב הרובוט — המוח','female','מחשב הרובוט הוא המוח שלו. הוא מריץ את התוכנה שהקבוצה כתבה, מקבל מידע ושולח הוראות לרכיבים. למשל, הוא יכול לבקש מבקר המנוע להרים זרוע. שמות שתפגשו הם רובו ריו או סיסטם קור, בהתאם למערכת.'),
('radio-link','cards','רדיו — הקשר לנהגים','male','הרדיו מאפשר למחשב הנהגים לתקשר עם הרובוט בלי כבל ביניהם. דרכו מגיעות הוראות הנהיגה, וחוזר מידע על מצב הרובוט. חשבו עליו כעל גשר התקשורת בין האנשים שמחזיקים בשלט לבין הרובוט שעל המגרש.'),
('sensors-feedback','cards','חיישנים — מרגישים את הסביבה','female','חיישנים עוזרים לרובוט לדעת מה קורה. אנקודר מודד סיבוב, למשל של גלגל. מפסק גבול מזהה שהזרוע הגיעה לנקודה מסוימת. מצלמה נותנת תמונה, שהתוכנה יכולה להשתמש בה כדי לזהות מטרה. כל אחד מספק מידע מסוג אחר.'),
('pneumatics-status','cards','נורה ובקר פנאומטיקה','male','נורת מצב הרובוט מראה מה מצבו: היא מהבהבת כשהוא מאופשר, ודולקת ברציפות כשהוא מושבת. ברובוט שיש בו בוכנות אוויר, יש גם בקר פנאומטיקה. הוא מפעיל את המדחס ואת השסתומים, וכך עוזר להפעיל מנגנונים באמצעות אוויר.'),
('question-two','statement','שאלה 2 מתוך 2','female','ועכשיו השאלה השנייה: מי מאפשר למחשב הנהגים לתקשר עם הרובוט באופן אלחוטי? המנוע, לוח חלוקת החשמל או הרדיו? בחרו את הרכיב שתפקידו להעביר את המידע בין הנהגים לרובוט.'),
('closing','cards','לכל רכיב יש תפקיד','male','בואו נסכם: הסוללה מספקת אנרגיה, המפסק מנתק, ולוח החלוקה מחלק חשמל. המחשב מחליט, הרדיו מתקשר, הבקר שולט במנוע, והחיישנים מוסיפים מידע. בפעם הבאה בסדנה, בקשו ממנטור להראות לכם את הרכיבים על רובוט כבוי. עכשיו תוכלו לזהות אותם ולהסביר מה הם עושים.')
]
items={
'battery':[('סוללה','מספקת אנרגיה לכל הרובוט')],
'main-breaker':[('מפסק ראשי','מדליק, מכבה ומגן')],
'power-distribution':[('PDH / PDP','מחלק חשמל לרכיבים')],
'motor-controller':[('בקר מנוע','שולט בעוצמה ובכיוון'),('מנוע','יוצר תנועה')],
'robot-brain':[('מחשב הרובוט','מריץ תוכנה ושולח הוראות')],
'radio-link':[('רדיו','מחבר בין הנהגים לרובוט')],
'sensors-feedback':[('אנקודר','מודד סיבוב'),('מפסק גבול','מזהה נקודת קצה'),('מצלמה','מספקת תמונה')],
'pneumatics-status':[('RSL','מציגה את מצב הרובוט'),('PH / PCM','מפעיל מדחס ושסתומים')],
'closing':[('אנרגיה','סוללה, מפסק ולוח חלוקה'),('פעולה','מחשב, בקר ומנוע'),('מידע','רדיו וחיישנים')]
}
scenes=[]
for i,(sid,layout,title,speaker,narration) in enumerate(scene_data):
    s=dict(id=sid,layout=layout,title=title,speaker=speaker,narration=narration,duration=15)
    if sid!='opening':s['diagram']=sid
    if sid in items:s['items']=[dict(heading=h,body=b) for h,b in items[sid]]
    if sid=='opening':s['subtitle']='רכיבי החשמל ב־FRC\nמה זה? ומה זה עושה?'
    if sid=='question-one':
        s.update(subtitle='מי מספק את האנרגיה?',body='הסוללה · הרדיו · המצלמה',quiz=dict(question='מי מספק לרובוט את האנרגיה שלו?',options=['הסוללה','הרדיו','המצלמה'],correct=0,explanation='הסוללה היא מקור האנרגיה של הרובוט. הרדיו והמצלמה משתמשים באנרגיה הזו כדי לפעול.'))
    if sid=='question-two':
        s.update(subtitle='מי מקשר בין הנהגים לרובוט?',body='המנוע · לוח החלוקה · הרדיו',quiz=dict(question='מי מאפשר תקשורת אלחוטית בין מחשב הנהגים לרובוט?',options=['המנוע','לוח חלוקת החשמל','הרדיו'],correct=2,explanation='הרדיו מעביר הוראות ומידע בין מחשב הנהגים לבין הרובוט.'))
    scenes.append(s)
doc=dict(version=1,title='מכירים את רכיבי החשמל | FRC',language='he-IL',voices=dict(female='Kore',male='Puck'),voice_style='Native Israeli Hebrew. Warm, clear and natural conversation for beginner teenage robotics students. Moderately brisk delivery, about 150 Hebrew words per minute. Simple, friendly explanation; short natural pauses. Read the supplied transcript exactly. No added words, music or effects.',scenes=scenes)
(p/'content.json').write_text(json.dumps(doc,ensure_ascii=False,indent=2)+'\n')
sources=json.loads((p/'sources.json').read_text())
sources['scope']='Simple identification of components and their functions, following the user-requested FRCElectrical.org guide. Generic controller illustration; roboRIO and Systemcore named without season eligibility claims.'
sources['sources'][:0]=[
 dict(title='FRCElectrical.org — FRC Control System',url='https://frcelectrical.org/FRC-Control-System/',supports=['component selection','simple component functions','motors, controllers, distribution, radio, sensors, RSL']),
 dict(title='FRCElectrical.org — Battery',url='https://frcelectrical.org/Battery/',supports=['battery as energy source']),
 dict(title='WPILib — Systemcore Introduction',url='https://docs.wpilib.org/en/latest/docs/software/systemcore-info/systemcore-introduction.html',supports=['Systemcore as robot controller'])]
(p/'sources.json').write_text(json.dumps(sources,ensure_ascii=False,indent=2)+'\n')
print('Simple narration words:',sum(len(s['narration'].split()) for s in scenes))
