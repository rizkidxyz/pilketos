import crypto from "crypto"

export function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

// util untuk bikin alert object
export function showMsg(type, msg) {
  let alertType = "warning"; // default

  if (["success", "error", "warning"].includes(type)) {
    alertType = type;
  }

  return {
    type: alertType,
    msg
  };
}

// middleware flash alert
export function alertMiddleware(req, res, next) {
  res.locals.alert = req.session.alert || null;
  delete req.session.alert; // hanya 1x tampil
  next();
}