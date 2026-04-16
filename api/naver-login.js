const {
  buildCallbackUrl,
  buildNaverAuthorizeUrl,
  createState,
  createStateCookie,
  getOrigin,
  getRequestUrl,
  redirectWithError,
  resolveRedirectTo,
} = require('./_lib/naver');

module.exports = function handler(req, res) {
  const clientId = process.env.NAVER_CLIENT_ID || '';
  const clientSecret = process.env.NAVER_CLIENT_SECRET || '';
  const origin = getOrigin(req);
  const requestUrl = getRequestUrl(req, origin, '/api/naver-login');
  const redirectTo = resolveRedirectTo(requestUrl, origin);

  if (!clientId || !clientSecret) {
    redirectWithError(
      res,
      redirectTo,
      'naver_config_missing',
      'NAVER_CLIENT_ID or NAVER_CLIENT_SECRET is missing.'
    );
    return;
  }

  const state = createState(redirectTo);

  res.statusCode = 302;
  res.setHeader('Set-Cookie', createStateCookie(state.nonce, origin));
  res.setHeader('Location', buildNaverAuthorizeUrl({
    clientId,
    callbackUrl: buildCallbackUrl(origin),
    state: state.payload,
  }));
  res.end();
};
