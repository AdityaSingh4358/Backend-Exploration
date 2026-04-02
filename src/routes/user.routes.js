import { Router } from "express";

import { 
    registerUser, loginUser, logoutUser, refreshAccessToken, } from "../controllers/user.controller.js";

import {upload} from "../middlewares/multer.middleware.js"

import { verifyJWT } from "../middlewares/auth.middleware.js";


const router = Router();

router.route("/register").post(
      upload.fields([
        {
            name: "avatar",
            maxCount: 1
        }, 
        {
            name: "coverImage",
            maxCount: 1
        }
        ]),
  
      registerUser);

router.route("/login").post(loginUser) 

// secured routes 
router.route("/logout").post(verifyJWT, logoutUser) // means that user must be login to access this 
router.route("/refresh-token")
    .post(refreshAccessToken) // means that user must be login to access this

router.route("/refresh-token").post(refreshAccessToken) // means that user must be login to access this
export default router;