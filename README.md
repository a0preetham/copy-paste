A simple website to allow copy-paste across devices. No data is logged.


To self-host:
[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https%3A%2F%2Fgithub.com%2Fa0preetham%2Fcopy-paste)

In Cloudflare dashboard, go to Worker -> Settings -> Variables and Secrets  -> Add secret called 'JWT_SECRET' with value from `https://jwtsecret.com/generate`.

