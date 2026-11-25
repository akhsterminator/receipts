"""Generates the fictional Tempo demo dataset. All people, emails and numbers are invented."""
import csv, json, os
root = os.path.join(os.path.dirname(__file__), "..", "examples", "tempo", "feedback")

tickets = [
 # id, subject, body, name, email, plan, date
 (4101,"Can I pause instead of cancelling?","Hi there, I'm travelling for work for two months and won't be able to make classes. I don't want to cancel because I'll lose my founding-member price, but I also don't want to pay for nothing. Is there any way to pause my membership? Thanks, Priya Raman","Priya Raman","priya.raman@example.com","Monthly","2026-10-28"),
 (4102,"Cancel my subscription","Please cancel my subscription. I'm having surgery next week and will be off exercise for at least 8 weeks. I would honestly rather pause than cancel but I couldn't find a pause button anywhere in the app.","Tom Okafor","tom.okafor@example.com","Monthly","2026-11-03"),
 (4103,"Pausing membership over summer","We're a family on the Family plan and we go to my parents' place every summer with no gym. Every year I cancel in June and sign up again in September, which is a pain. Please add a way to pause the family plan for a couple of months.","Lena Fischer","lena.f@example.com","Family","2026-06-02"),
 (4104,"Hold my account while injured","I sprained my ankle and my physio says no classes for 6 weeks. Can you put my account on hold? I really don't want to lose my streak and my history. Call me on +44 7700 900123 if easier.","Marcus Bell","marcus.bell@example.com","Annual","2026-09-14"),
 (4105,"Charged after trial","I was charged £24.99 the day after my free trial ended. I thought I had cancelled but the app said my trial was still active. I didn't get any reminder email before the trial ended. Please refund. You can reach me at aisha.k@example.com or 07700 900456.","Aisha Khan","aisha.k@example.com","Trial","2026-10-19"),
 (4106,"No reminder before annual renewal","My annual plan renewed for £199 without any warning. Every other subscription I have sends a reminder a week before. This is really frustrating and feels sneaky.","Daniel Moreau","d.moreau@example.com","Annual","2026-08-22"),
 (4107,"Need a VAT invoice","My employer reimburses wellness subscriptions but I need a proper VAT invoice with my company name. The receipt email just says Tempo and the amount. Where can I download invoices? Please send it to 14 Rosebank Road, Edinburgh EH5 3QN.","Sofia Lindqvist","sofia.lindqvist@example.com","Annual","2026-07-11"),
 (4108,"Download classes for flights","Is there any way to download classes to watch offline? I fly a lot for work and would love to do the mobility sessions in hotel rooms where the wifi is terrible.","Kenji Watanabe","kenji.w@example.com","Monthly","2026-11-10"),
 (4109,"Videos keep buffering at the gym","The gym basement has terrible signal so the videos keep buffering and freezing halfway through a set. I end up just giving up. Offline downloads would fix this completely.","Hannah Cole","hannah.cole@example.com","Monthly","2026-10-05"),
 (4110,"App crashes on Android when casting","Every time I try to cast a class to my TV from my Pixel 7 the app crashes. This has happened 5 times this week. Android 14, app version 3.8.2.","Ravi Patel","ravi.patel@example.com","Annual","2026-11-12"),
 (4111,"Crashing on Samsung","The app freezes and crashes on my Galaxy S22 when I open the downloads tab. Reinstalling didn't help.","Olivia Grant","olivia.grant@example.com","Monthly","2026-10-30"),
 (4112,"Family plan for me and my partner?","My partner and I both use Tempo on separate accounts and pay twice. Do you have a couples or family plan? We'd switch to an annual family plan in a heartbeat.","Jonas Berg","jonas.berg@example.com","Monthly","2026-09-03"),
 (4113,"Add my teenage son","Is there a way to add my 16 year old to my account without him seeing my history and stats? A family plan with separate profiles would be perfect.","Claire Dubois","claire.dubois@example.com","Annual","2026-05-20"),
 (4114,"Filter classes by equipment","I only have a pair of dumbbells at home. It takes forever to find classes that don't need a bench or a kettlebell. Please let us filter classes by equipment.","Mateo Rossi","mateo.rossi@example.com","Monthly","2026-10-21"),
 (4115,"Search by class length","I usually have exactly 20 minutes at lunch. There's no way to filter classes by length so I scroll for ages. A duration filter would save me so much time.","Grace Liu","grace.liu@example.com","Annual","2026-11-15"),
 (4116,"Apple Watch heart rate","Does Tempo work with Apple Watch? I'd love to see my heart rate zones during the HIIT classes like I can in other apps. It's the main reason I'm considering switching to another app.","Noah Schmidt","noah.schmidt@example.com","Annual","2026-10-02"),
 (4117,"Garmin sync","My workouts don't show up in Garmin Connect. I have to log every class manually which is tedious. Please add a Garmin integration.","Emma Novak","emma.novak@example.com","Monthly","2026-09-27"),
 (4118,"Pause for maternity leave","I'm due in March and won't be exercising for a while after. Can I freeze my annual membership and pick it back up later? I'd hate to lose the remaining months.","Fatima Al-Sayed","fatima.alsayed@example.com","Annual","2026-11-18"),
 (4119,"Card declined but still charged?","My card was declined, then I got charged twice the next day. My bank shows two payments of £24.99. The card is 4111 1111 1111 1111, please don't charge it again until this is fixed. Regards, George Evans","George Evans","george.evans@example.com","Monthly","2026-10-25"),
 (4120,"Calendar reminders","I keep forgetting the classes I've booked. It would be great if booked classes synced to my Google Calendar.","Isabel Costa","isabel.costa@example.com","Monthly","2026-08-30"),
 (4121,"Live class times are UK only","Live classes are all at times that work for the UK. I'm in Toronto so the 7am class is 2am for me. Can you add on-demand replays of live classes quickly?","Liam Tremblay","liam.tremblay@example.com","Annual","2025-06-14"),
 (4122,"Refund for unused months","I want to cancel my annual plan because I'm moving abroad for six months. Can I get a refund for the unused months, or at least pause it until I'm back?","Yara Haddad","yara.haddad@example.com","Annual","2026-10-08"),
 (4123,"Invoices for my team","I manage wellness benefits for a team of 12. We pay for each person separately and I need consolidated invoices every month for finance. Is there a business plan?\n\nOliver Wright\nHead of People, Acme Ltd\n020 7946 0958","Oliver Wright","oliver.wright@acme-example.co.uk","Team","2026-09-09"),
 (4124,"Team admin dashboard","We bought 30 seats for our company. As the admin I have no way to see who has activated their account or to reassign a seat when someone leaves.\n\n-- Nadia","Nadia Petrova","nadia.petrova@globex-example.com","Team","2026-10-16"),
 (4125,"Download for the tube","I do my stretching on the tube commute where there's no signal. Downloading a few classes the night before would be ideal.","Chloe Adams","chloe.adams@example.com","Monthly","2026-11-01"),
 (4126,"Pause please","Hello, my name is Ben Carter and I'd like to pause my membership for January. I'm going travelling. Thanks","Ben Carter","ben.carter@example.com","Monthly","2026-11-20"),
 (4127,"Video quality drops","The video quality drops to blurry on my home wifi even though Netflix is fine. Can I force HD?","Ella Morgan","ella.morgan@example.com","Monthly","2026-07-29"),
 (4128,"Garmin and Strava please","I'd love Strava and Garmin integration so my Tempo workouts count towards my weekly training load. Right now I just don't bother logging them.","Lucas Martin","lucas.martin@example.com","Annual","2026-11-06"),
 (4129,"Trial ended without warning","No email or notification told me the trial was ending. I would have cancelled. I feel tricked.","Mia Johnson","mia.johnson@example.com","Trial","2026-11-11"),
 (4130,"Remove my data","Please delete my account and all my data. I'm cancelling because the price went up.","Henry Clarke","henry.clarke@example.com","Monthly","2025-04-02"),
]

with open(os.path.join(root, "support-tickets.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["Ticket ID","Subject","Description","Requester","Requester email","Plan","Created at"])
    for t in tickets: w.writerow(t)

reviews = [
 # id, rating, title, review, author, date, platform
 ("r-901",2,"Need a pause option","Love the instructors, but there's no way to pause your subscription. I had to cancel when I got injured and now I've lost my founder pricing. Seriously considering not coming back.","fitmum_88","2026-10-12","iOS"),
 ("r-902",5,"Best home workout app","The instructors are fantastic and the music is great. Honestly the best fitness app I've used.","Jay R","2026-11-02","iOS"),
 ("r-903",3,"Great classes, no offline mode","Great classes but I can't use it on flights or in my garage gym because there's no offline mode. Please add downloads!","traveller_tom","2026-09-19","Android"),
 ("r-904",1,"Crashes constantly","Crashes constantly on my Pixel. Every time I cast to the TV it closes. Unusable until fixed. @TempoSupport please help.","Priscilla","2026-11-08","Android"),
 ("r-905",4,"Almost perfect","Almost perfect. Just wish I could filter by class length and equipment, the search is clunky.","Sam","2026-10-27","iOS"),
 ("r-906",2,"Charged after free trial","Charged me the second the trial ended with no reminder. Got a refund eventually but it took 3 emails.","angry_annie","2026-10-21","iOS"),
 ("r-907",3,"Needs Apple Watch support","Good app but no Apple Watch support in 2026 is a joke. I want to see my heart rate during class.","Dev","2026-09-30","iOS"),
 ("r-908",5,"Changed my mornings","Tempo has genuinely changed my mornings. The 15 minute stretch classes are perfect.","Marta","2026-08-15","Android"),
 ("r-909",2,"Family plan please","My wife and I both pay full price. A family plan would make this a no-brainer, otherwise we're switching to a cheaper app.","DadBod_Dan","2026-10-03","Android"),
 ("r-910",3,"Buffering","Videos buffer constantly unless I'm right next to the router. Let me download classes!","kim","2026-07-22","Android"),
 ("r-911",4,"Solid","Solid app. Would love Garmin sync so my workouts show up with my runs.","runner_rob","2026-09-08","Android"),
 ("r-912",1,"Can't pause, had to cancel","You can't pause your membership. I had to cancel during my pregnancy and it was a whole process. Deal-breaker for me.","Hollie","2026-11-14","iOS"),
 ("r-913",4,"Great but search is bad","Great classes, but finding a 20 minute class with no equipment takes forever. Needs better filters.","N. Ali","2026-11-05","iOS"),
 ("r-914",2,"Annual renewal surprise","Auto-renewed my annual subscription without a reminder email. Not cool.","Pete","2025-09-01","iOS"),
 ("r-915",5,"Love the instructors","Love the instructors, especially the Sunday yoga. Worth every penny.","yogi_lou","2026-10-18","iOS"),
 ("r-916",3,"Android app freezes","The Android app freezes when I open downloads or try to cast. Please fix.","Arjun","2026-10-29","Android"),
]
with open(os.path.join(root, "app-reviews.csv"), "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["Review ID","Rating","Title","Review","Author","Date","Platform"])
    for r in reviews: w.writerow(r)

nps = [
 {"id":"nps-01","score":3,"comment":"I'd recommend it more if I could pause my membership when I travel instead of cancelling and rejoining.","segment":"Monthly","submitted_at":"2026-10-14","email":"a.ward@example.com"},
 {"id":"nps-02","score":9,"comment":"Instructors are brilliant and the classes are the right length.","segment":"Annual","submitted_at":"2026-10-14","email":"b.ng@example.com"},
 {"id":"nps-03","score":6,"comment":"Offline downloads. I travel every week and the app is useless on planes.","segment":"Annual","submitted_at":"2026-10-15","email":"c.osei@example.com"},
 {"id":"nps-04","score":5,"comment":"The billing is confusing. I didn't know my trial had turned into a paid plan until I saw my bank statement.","segment":"Trial","submitted_at":"2026-10-15","email":"d.kim@example.com"},
 {"id":"nps-05","score":7,"comment":"Need a family plan. Paying for two accounts in one house feels wrong.","segment":"Monthly","submitted_at":"2026-10-16","email":"e.ruiz@example.com"},
 {"id":"nps-06","score":4,"comment":"For a team plan we need an admin dashboard to manage seats and see who is actually using it.","segment":"Team","submitted_at":"2026-10-16","email":"f.adeyemi@initech-example.com"},
 {"id":"nps-07","score":8,"comment":"Great app. Apple Watch heart rate would make it perfect.","segment":"Annual","submitted_at":"2026-10-17","email":"g.ito@example.com"},
 {"id":"nps-08","score":2,"comment":"Crashes on Android all the time, especially when casting. Really frustrating when you're mid-workout.","segment":"Monthly","submitted_at":"2026-10-18","email":"h.mensah@example.com"},
 {"id":"nps-09","score":6,"comment":"Let me filter by equipment! I don't own a kettlebell.","segment":"Monthly","submitted_at":"2026-10-18","email":"i.berg@example.com"},
 {"id":"nps-10","score":5,"comment":"I was going to cancel for the summer but I'd rather pause it. Please add a pause option.","segment":"Annual","submitted_at":"2026-10-19","email":"j.walsh@example.com"},
 {"id":"nps-11","score":10,"comment":"Absolutely love it, the variety of classes is amazing.","segment":"Annual","submitted_at":"2026-10-20","email":"k.horvat@example.com"},
 {"id":"nps-12","score":6,"comment":"We need consolidated invoices for our team plan, finance keeps chasing me for receipts.","segment":"Team","submitted_at":"2026-10-21","email":"l.santos@umbrella-example.com"},
]
with open(os.path.join(root, "nps-survey.json"), "w") as f:
    json.dump(nps, f, indent=2)

vtt = """WEBVTT

NOTE
segment: Annual
interviewer: Alex

1
00:00:01.000 --> 00:00:06.000
<v Alex>Thanks for making time. Can you tell me about the last time you thought about cancelling Tempo?</v>

2
00:00:06.500 --> 00:00:21.000
<v Rachel Adeyemi>Yeah, it was in September. I had a knee operation and I knew I wouldn't be doing classes for about two months. I went into the app to pause it and there just wasn't an option.</v>

3
00:00:21.500 --> 00:00:25.000
<v Alex>What did you do then?</v>

4
00:00:25.500 --> 00:00:44.000
<v Rachel Adeyemi>I emailed support, and they said the only thing they could do was cancel. So I cancelled. And honestly, I nearly didn't come back. When you cancel you're out of the habit, and then you see the price again and you think, do I really need this?</v>

5
00:00:44.500 --> 00:00:48.000
<v Alex>What would you have wanted to happen?</v>

6
00:00:48.500 --> 00:01:05.000
<v Rachel Adeyemi>I'd have happily paid a small amount to keep my account and my history. Even just freezing it for free for a couple of months would have kept me. I'd have come back the week I was allowed.</v>

7
00:01:05.500 --> 00:01:09.000
<v Alex>Is there anything else that frustrates you?</v>

8
00:01:09.500 --> 00:01:24.000
<v Rachel Adeyemi>Finding classes. I have twenty minutes and a resistance band, and I spend five of those twenty minutes scrolling. I wish I could just say: twenty minutes, band, lower body.</v>
"""
open(os.path.join(root, "interviews", "p01-rachel-2026-10-02.vtt"), "w").write(vtt)

p02 = """---
participant: P2
segment: Team
date: 2026-10-09
interviewer: Alex
title: Interview P2 - HR lead at a 40-person agency
---
Alex: How did Tempo end up in your benefits package?
Joanne Mills: One of our designers loved it, so we bought 30 seats in the spring. Setting it up was fine, but managing it since has been painful.
Alex: Painful how?
Joanne Mills: I have no idea who is actually using it. When someone leaves I can't move their seat to the new starter, I have to email your support team and wait. It's very manual.
Alex: How do you handle that today?
Joanne Mills: I keep a spreadsheet of who has a seat and I chase people. Every month finance asks me for one invoice for all the seats and I have to stitch together thirty receipts. That's the bit that might make us drop it at renewal.
Alex: What would good look like?
Joanne Mills: An admin page. Who's active, reassign a seat, one invoice a month. That's honestly it.
"""
open(os.path.join(root, "interviews", "p02-team-admin.md"), "w").write(p02)

p03 = """---
participant: P3
segment: Monthly
date: 2026-10-21
interviewer: Alex
---
Alex: Walk me through a typical week with Tempo.
Carlos Mendes: I travel for work most weeks. Monday to Thursday I'm in hotels, and the hotel wifi is always awful, so the videos buffer and drop to really low quality.
Alex: What do you do when that happens?
Carlos Mendes: Mostly I give up and do something from memory. I've tried screen recording classes at home so I have them on the road, which is a bit ridiculous.
Alex: If you could change one thing?
Carlos Mendes: Downloads. Let me download five classes on Sunday night and I'm sorted for the week. I'd pay more for that, genuinely.
Alex: Anything about billing or your plan?
Carlos Mendes: No, billing is fine. Oh, actually, I'd love the workouts to go into Garmin. My coach looks at my training load and Tempo sessions are invisible to her.
"""
open(os.path.join(root, "interviews", "p03-frequent-traveller.txt"), "w").write(p03)

p04 = """1
00:00:00,000 --> 00:00:05,000
Interviewer: When did you last nearly cancel?

2
00:00:05,500 --> 00:00:19,000
Participant: Honestly, every January. We go skiing for three weeks and I don't use it, so I cancel and resubscribe, and every time I'm scared I'll lose my founding member price.

3
00:00:19,500 --> 00:00:23,000
Interviewer: Have you lost it?

4
00:00:23,500 --> 00:00:37,000
Participant: Once, yes. Support gave it back after I complained, but it shouldn't need a complaint. A pause button would solve the whole thing for me.

5
00:00:37,500 --> 00:00:41,000
Interviewer: Anything else you'd want?

6
00:00:41,500 --> 00:00:55,000
Participant: My kids want to use it too, but if they use my account it messes up my recommendations and my stats. Separate profiles under one family plan would be ideal.
"""
open(os.path.join(root, "interviews", "p04-2026-11-04.srt"), "w").write(p04)
print("ok")
