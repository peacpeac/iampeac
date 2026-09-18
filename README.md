# iampeac.com — Personal Web Hub & Portfolio

This repository contains the source code for the personal web presence of **Peter Ac (`@iampeac`)**, designed to be hosted at **`iampeac.com`**.

---

## 1. Setup Free Email Forwarding on Porkbun (Takes ~1 min)

Because `iampeac.com` is registered on Porkbun, you get **free email forwarding** (no need to pay for Google Workspace or email hosting):

1. Go to [Porkbun Domain Management](https://porkbun.com/account/domains).
2. Next to `iampeac.com`, click the **Details** dropdown or the **Email Forwarding** icon (envelope).
3. Click **Add Forwarding**:
   * **Username**: `peter` (or `contact`)
   * **Forward To**: *Your personal email address (e.g. your Gmail)*
4. Click **Submit**. Porkbun automatically creates the necessary MX records in DNS.
5. Anyone who emails `peter@iampeac.com` will now reach your personal inbox directly!

---

## 2. Host This Website for Free ($0/month)

You can host this website completely free with automatic HTTPS/SSL using either **Cloudflare Pages** or **GitHub Pages**.

### Option A: Cloudflare Pages (Recommended - Fastest & Easiest)
1. Sign in or create a free account at [dash.cloudflare.com](https://dash.cloudflare.com/).
2. Navigate to **Workers & Pages** &rarr; **Create application** &rarr; **Pages** &rarr; **Upload assets**.
3. Drag and drop the files in this folder (`index.html`, `style.css`, `script.js`, `CNAME`).
4. Click **Deploy Site**.
5. Under your project settings, go to **Custom Domains** &rarr; **Set up a custom domain** &rarr; enter `iampeac.com`.
6. Follow the 1-click prompt to point the DNS.

### Option B: GitHub Pages
1. Push this folder to a GitHub repository (e.g. `iampeac/portfolio` or `iampeac.github.io`).
2. In the GitHub repository, go to **Settings** &rarr; **Pages**.
3. Under **Branch**, select `main` / `root` and click **Save**.
4. In the **Custom domain** field, ensure `iampeac.com` is entered and check **Enforce HTTPS**.
5. In Porkbun DNS management:
   * Add 4 `A` records pointing `@` to GitHub's IPs:
     * `185.199.108.153`
     * `185.199.109.153`
     * `185.199.110.153`
     * `185.199.111.153`
   * Add 1 `CNAME` record for `www` pointing to `<your-username>.github.io`.

---

## 3. Local Development / Preview

To preview the website locally on your computer:
```bash
python -m http.server 8000
```
Then open `http://localhost:8000` in your web browser.
