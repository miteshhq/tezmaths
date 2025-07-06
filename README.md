# Tezmaths App

## Admin Credentials

adminEmail: <tezmaths@admin.com>
password: admin@t32m392s

Make account in firebase and get web client info then also get the service-key and place in the firebase folder - in the file setAdminToken.ts set the id of admin account and set the location of the service-key.json file

make apps like ios and android and get their files after adding the sha1 keys etc and place them in root folder. in useGoogleSignIn set the web client id from the console.cloud.google.com apis & services credentials window.

--------------

Image and text can't be shared together in one go, user can share image or text at once, and to share both he/she can share both one by one.

Battle mode shows questions from first 10 levels from each level it shows the max display questions.
Say there are 500 questions in level 1 and max display questions value is set to 10, and same for levels upto 10, then total questions will be 10 * 10. We will set it to 25 max if you still need this but once its done we will not change it.

Its not viable to store history of previous battles etc, and this can't be done.

There are too many issues in colors by yourside, we used those colors that were in your first given pdf, and now you are complaining. Somewhere you say use black somewhere purple and somewhere what and what. We will fix it only once and last time.

For searching showing in battle mode selection, file instructions are given that user can reopen the app by closing it.

No update will be made in other battle functionality from our side.

Home screen quitting thing will be checked.

We can't find any clutter in leadersboard, and your team didn't made it clear that only highest score should be displayed. Will be checked.

Profile showing wrong level will be checked.

Old room code showing will be checked.

Profile setup and registration flow will be checked.

Explanation in quiz cut off will be fixed.

-----------

- set the colors - DONE
- home screen quitting app issues - Do you want to quit the app? - DONE
- profile is showing wrong current level - it displays 1 when 3rd is unlocked, and 2 when 4th is unlocked. - DONE
- explanation in quiz when wrong is getting cut off - use scroll view - DONE
- openings quiz shows 20 questions in a level but after playing 1 question next level start - to be fixed. - DONE
- in leadersboard, store only highest scroe and show it and compare it, not total - DONE
- set battle mode questions max 25 only. - DONE
- old room code showing after refresh in battle selection mode - to be fixed. - DONE

- signup and signin looping flow to be fixed.
- google sign in logs with old id after using logout - to be fixed yet.
