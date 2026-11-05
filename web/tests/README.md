# Web UI tests

Run the browser suite from `web/`:

```sh
npm run test:ui
```

The Playwright config starts Vite on `127.0.0.1:4177` with a strict port and mocks API responses in each test; it does not connect to the app database.

Install the Chromium browser once per environment when it is missing:

```sh
npx playwright install chromium
```

On a Linux machine missing Chromium system libraries, install the browser dependencies with:

```sh
npx playwright install --with-deps chromium
```

## Tests against the real backend

`tests/api/` runs against a running v2 backend on a throwaway PostgreSQL database (never the payroll database: the specs create test staff through the Admin API):

```sh
PW_ADMIN_PASS=<admin password of that test database> VITE_API_TARGET=http://127.0.0.1:<backend port> npm run test:api
```

`staff-app.spec.ts` covers the staff app on `/api/v2/me/*`: today, check-in/out (a refused check-out is faked once with `page.route`), month switching inside the allowed range, the load-error retry, a request shown as waiting then cancelled, and an approved payslip shown as official.

Run these specs on a fresh database each time: settings versions, payroll periods and slips accumulate per month, so a database used by earlier runs can make the viewed month differ from the current one. From the repo root, with the local dev PostgreSQL from `docs/postgres-local.md`:

```sh
set -a; . ./.env.postgres-local; set +a
export DATABASE_URL="postgresql://luong_dev:${LOCAL_PG_DEV_PASSWORD}@127.0.0.1:55432/luong_dev"
npm run db:reset-dev                       # refuses anything but a local *_dev database
ADMIN_PASSWORD=<pass> npm start            # creates the admin account on an empty database
cd web && PW_ADMIN_USER=admin PW_ADMIN_PASS=<pass> npm run test:api
```

On Linux without root, Chromium may miss system libraries: download the `libnspr4`, `libnss3` and `libasound2` packages, unpack them with `dpkg -x` into a folder and set `LD_LIBRARY_PATH` to its `usr/lib/<arch>-linux-gnu` before running Playwright.
