# pg.mccullo.ug/h/ (Remixed)

Hey, this is my attempt at refactoring my old SPA site into a fullstack Remix App. It still has a couple of spots relying on the REST API, but I'm working to gradually transition those into resource routes.

For site visitors, the site is pretty straightforward: little social-media-esque "postcards" that display content in descending chronological order, with infinite scrolling loading more and more... I transferred my old Facebook and Instagram posts into the MongoDB servicing the site, so it goes back quite a way, and one of the few things that kept me from deleting my FB account were the "on this day" posts, so I integrated that functionality as well.

Otherwise, for me as the administrator, this site provides a custom email client (thanks Postmark App!), and an ability to easily add and edit content via the forward-facing GUI, which is fun.

Constant work in progress, always grateful for feedback. Feel free to copy/steal as much of this as you like. I'm sure whomever I stole it from won't mind.