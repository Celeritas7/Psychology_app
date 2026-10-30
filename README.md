# Psychology

The Psychology department app: your life history, present-day incidents and recurring patterns, each looked at through eight lenses (body, behaviour, thoughts, feelings, history, people, context, needs). Data lives in the `psychology_*` tables of the **General_apps** Supabase project, locked to your account by row-level security.

No build step. Plain HTML, CSS and JavaScript modules.

## Launch on GitHub Pages

1. Create a repository, for example `Celeritas7/psychology`, and push these files to `main`.
2. In the repo: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / root**.
3. In Supabase (General_apps): **Authentication → URL Configuration → Redirect URLs**, add
   `https://celeritas7.github.io/psychology/`
   (match the repo name you chose). Google sign-in is already set up for your other apps.
4. Open the Pages URL and choose **Continue with Google** with `mangaonkaraniket@gmail.com`.
   Any other account is signed straight out (`ownerEmail` in `config.js`).

To try the interface without signing in, add `?demo` to the URL. It uses sample data and saves nothing.

The repository can be public: it contains no personal data. The publishable key in `config.js` is meant for browsers; the tables only answer to the signed-in owner.

## Screens

| Tab | What it does |
|---|---|
| Today | The lens prism (how much you have looked from each side), the next question waiting for you, quick add |
| Timeline | Memories by stage of life. Each keeps *what I called it then* (failure, win, mixed) apart from *how I read it now*. "Recall it again" saves a new telling beside the old one; nothing is overwritten |
| Ask | Topics with questions, answered one at a time. Claude can add topics and questions straight into the database |
| Patterns | One formulation per recurring pattern: what happens, why it was likely, what sets it off, what keeps it going, what helps. Confidence, evidence links, hand-off to Neurology, Disaster Management, Ethics |
| More | Incidents, thought tests, lenses, export (readable summary or full JSON), help numbers |

## Adding a lens

Append an object to `LENSES` in `lenses.js` (id, name, colour, three questions). Everything else picks it up.

## Files

`index.html` shell, `styles.css` design, `config.js` Supabase settings, `lenses.js` lens registry and labels, `db.js` data layer (Supabase or sample), `app.js` screens and logic, `schema.sql` table reference.
