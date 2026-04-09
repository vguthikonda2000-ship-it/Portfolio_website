# Portfolio Site

This site is now split into two layers:

- `index.html`, `styles.css`, and `script.js` control the design and behavior.
- `content/site.json` stores the editable text, links, image paths, and video URLs.

## Local preview

Because the page now loads `content/site.json`, preview it through a local web server or GitHub Pages instead of opening `index.html` directly from the file system.

## Visual editing

The local editor entry point is:

- `/editor/`

It saves your draft in the browser so you can work offline before pushing anything.

The local editor now prefers IndexedDB for draft media storage, which is much more reliable for larger uploads than `localStorage`.

The Git-backed CMS scaffold is still available at:

- `/admin/`

Once your GitHub Pages site is live, the editor will be at:

- `https://your-username.github.io/your-repo-name/admin/`

## Media storage

- Images uploaded through the CMS go into `assets/uploads/`
- Images uploaded through the local editor are resized when needed before being saved into the browser draft
- Larger videos are better hosted elsewhere, then pasted into the `video` field as a URL
- Repo-stored videos can work, but they will make the GitHub repo much heavier over time

## GitHub setup for Decap CMS

Before the CMS can save changes to GitHub, update this file:

- `admin/config.yml`

Replace:

- `your-github-username/your-repo-name`

with your real repo path.

## Important note about authentication

Because you want to host on GitHub Pages, the CMS also needs a GitHub auth flow before it can write back to the repo in production.

Common ways to handle that are:

- Use Decap CMS with a GitHub OAuth proxy
- Host the auth helper on Netlify, Vercel, or a small serverless function

The site and content structure are already in place, so the remaining production task is mainly the GitHub auth connection for the CMS.

## Direct editing without the CMS

If you ever want to make quick changes manually, edit:

- `content/site.json`
