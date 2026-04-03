import { asyncHandler } from "../utils/asyncHandler.js";

import {ApiError} from "../utils/ApiError.js"

import { User} from "../models/user.model.js"
import {uploadOnCloudinary} from "../utils/cloudinary.js"
import { ApiResponse } from "../utils/ApiResponse.js";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

// 12354364858
//one@gmail.com
import mongoose from "mongoose";

   const generateAccessAndRefreshTokens = async (userId) => {
    try {
        const user = await User.findById(userId)
        const accessToken = user.generateAccessToken()
        const refreshToken = user.generateRefreshToken()

        user.refreshToken = refreshToken
        await user.save({validateBeforeSave: false})
        return {accessToken, refreshToken}
        
    } catch (error) {
        throw new ApiError(500, "Something went wrong while generating refresh and access token")

        
    }
   }




    const registerUser = asyncHandler(async (req, res) => {


      // Get the user detail from frontend 
      //validation - sab pehle se theek hai ya nhi ? 
      // Check user is not already registerd  - check username and email 
      // Check for the images  and check for the avatar 
      // If they are vailable -> upload the images to cloudinary and get the url
      // Create the user object -> create the entry in the database 
      // Remove the passwpord and the refresh token from the response 
      //Check for the user creation 
      // return respond with success message and user details

      const {fullName, email, username, password } = req.body
    //console.log("email: ", email);

    if (
        [fullName, email, username, password].some((field) => field?.trim() === "")
    ) {
        throw new ApiError(400, "All fields are required")
    }

    console.log("EMAIL:", email);
    console.log("USERNAME:", username);

    const existedUser = await User.findOne({
        $or: [{ username }, { email }]
    })

    if (existedUser) {
        throw new ApiError(409, "User with email or username already exists")
    }
    console.log(req.files);

    const avatarLocalPath = req.files?.avatar[0]?.path;
    //const coverImageLocalPath = req.files?.coverImage[0]?.path;

    //check kar rahe hain ki cover image file hai ya nahi, kyunki wo optional hai
    let coverImageLocalPath;
    if (req.files && Array.isArray(req.files.coverImage) && req.files.coverImage.length > 0) {
        coverImageLocalPath = req.files.coverImage[0].path
    }
    

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is required")
    }

    const avatar = await uploadOnCloudinary(avatarLocalPath)
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!avatar) {
        throw new ApiError(400, "Avatar file is required")
    }
   

    const user = await User.create({
        fullName,
        avatar: avatar.url,
        coverImage: coverImage?.url || "",
        email, 
        password,
        username: username.toLowerCase()
    })

    const createdUser = await User.findById(user._id).select(
        "-password -refreshToken"
    )

    if (!createdUser) {
        throw new ApiError(500, "Something went wrong while registering the user")
    }

    return res.status(201).json(
        new ApiResponse(200, createdUser, "User registered Successfully")
    )

    
    })


    // NOW LOGIN THE USER 

    // req body -> data 
    // username  or email 
    // find the user in the database
    // if user not found -> throw error
    // password check katrna hai -> bcrypt compare
    // access and refresh token generate karne hain -> jwt
    // refresh token ko database me save karna hai 
    // response me access token aur user details bhejni hai

    // send cookies to the frontend -> http only cookie me refresh token bhejna hai

    
    const loginUser = asyncHandler(async (req, res) => {
        const { email,username, password } = req.body
        console.log(email);

        if(!email && !username){
            throw new ApiError(400, "Email or username is required")
        }

        // HERE IS THE ALTERNATIVE CODE FOR THE ABOVE CHECK
        // if(!(username || email)) {
        //     throw new ApiError(400, "Email or username is required")
        // }


        // value ya to email ya username ke base pe mil jaye 
        const user = await User.findOne({
            $or: [{ email }, { username }]
        })

        if(!user){
            throw new ApiError(404, "User not found exist")
        }

        const isPasswordValid = await user.isPasswordCorrect(password)

        if(!isPasswordValid){
            throw new ApiError(401, "Invalid user credentials")
        }

        const {accessToken, refreshToken} = await generateAccessAndRefreshTokens(user._id)

        const loggedInUser = await User.findById(user._id).select("-password -refreshToken")
        
        // AB COOKIES BHEJNI HAIN FRONTEND KO

        const options = {
            httpOnly: true,
            secure:true   // server se modify hogi barabar hai ki nahi, agar https hai to true karna hai
        }   
        
        
        return res
        .status(200)
        .cookie("accessToken", accessToken, options)
        .cookie("refreshToken", refreshToken, options)

        .json(
             new ApiResponse(
                200,
                 {
                    user: loggedInUser, accessToken , refreshToken
                },
                     "User logged in successfully")
        )





    })


    // LOGOUT LOGIC FOR THE USER 
    const logoutUser = asyncHandler(async (req, res) => {
        await User.findByIdAndUpdate(
            req.user._id,
            {
                $unset: {
                    refreshToken: undefined // this removes the field from the document 
                }
            },
            {
                new: true
            }
        )  
        
        const options = {
            httpOnly: true,
            secure: true,
            
        }

        return res
        .status(200)
        .clearCookie("accessToken", options) 
        .clearCookie("refreshToken", options) 
        
        // means that we are clearing the cookies from the frontend
        .json(
            new ApiResponse(200, {}, "User logged out successfully")
        )

             
       
    })

    const refreshAccessToken = asyncHandler(async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken || req.body.refreshToken

    if (!incomingRefreshToken) {
        throw new ApiError(401, "unauthorized request")
    }

    try { // decoded token vo token hai jo user ke pass hai, usko verify karna hai ki wo valid hai ya nahi, agar valid hai to usme se user id nikalni hai
        const decodedToken = jwt.verify(
            incomingRefreshToken,
            process.env.REFRESH_TOKEN_SECRET
        )
    
        const user = await User.findById(decodedToken?._id)
    
        if (!user) {
            throw new ApiError(401, "Invalid refresh token")
        }
    
        if (incomingRefreshToken !== user?.refreshToken) {
            throw new ApiError(401, "Refresh token is expired or used")
            
        }
    
        const options = {
            httpOnly: true,
            secure: true
        }
    
        const {accessToken, newRefreshToken} = await generateAccessAndRefreshTokens(user._id) // matlab ki access token generate karna hai aur refresh token bhi generate karna hai, kyunki refresh token bhi change hoga jab bhi access token refresh hoga, to dono ko generate karna hai
    
        return res
        .status(200)
        .cookie("accessToken", accessToken, options) // matlab
        .cookie("refreshToken", newRefreshToken, options)
        .json(
            new ApiResponse( // matlab ki response me access token aur refresh token dono bhejni hai, taki frontend ke pass dono tokens
                200, 
                {accessToken, refreshToken: newRefreshToken},
                "Access token refreshed"
            )
        )
    } catch (error) {
        throw new ApiError(401, error?.message || "Invalid refresh token")
    }

})


const changeCurrentPassword = asyncHandler(async (req, res) => {
     const {oldPassword,newPassword} = req.body

     const user= await User.findById(req.user._id) //  matlab ki find user fromm database

     const isPasswordCorrect = await user.isPasswordCorrect(oldPassword) // matlab ki check karo ki old password sahi hai ya nahi

        if(!isPasswordCorrect){
            throw new ApiError(400, "invalid old password")
        }

        user.password = newPassword // matlab ki new password set kar do

        await user.save({validateBeforeSave: false}) // matlab ki save kar do database me

        return res
        .status(200)
        .json(
            new ApiResponse(200, {}, "Password changed successfully")
        )
})

const getCurrentUser = asyncHandler(async(req, res) => {
    return res
    .status(200)
    .json(new ApiResponse(
        200,
        req.user,
        "User fetched successfully"
    ))
})
const updateAccountDetails = asyncHandler(async (req, res) => {
    const {fullName,  email} = req.body

    if(!fullName || !email){
        throw new ApiError(400, "All fields are required ")

    }
    
    const user=await User.findByIdAndUpdate(req.user?._id,
        {
             $set: {
                fullName,
                email: email
             }   
        },
        {new: true} // iska matab ki updated user ko return karo, nahi to old user return karega
    ).select("-password")

     return res
     .status(200)
     .json(
        new ApiResponse(200, user, "Account details updated successfully")
     )
});


// NOW UPDATE THE FILES 
const updateUserAvtar = asyncHandler(async (req, res) => {

    const avatarLocalPath = req.files?.path;

    if (!avatarLocalPath) {
        throw new ApiError(400, "Avatar file is missing")

    }

    // DELETE OLD IMAGE - ASSIGNMENT 

    const avatar = await uploadOnCloudinary(avatarLocalPath)

    if (!avatar.url) {
        throw new ApiError(500, "Something went wrong while uploading the avatar")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                avatar: avatar.url
            }
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Avatar image  updated successfully")
    )
})

//delete old image ka code likhna hai  


const updateUserCoverImage = asyncHandler(async (req, res) => {
    const coverImageLocalPath = req.files?.path;

    if (!coverImageLocalPath) {
        throw new ApiError(400, "Cover image file is missing")
    }    

    // DLETE OLD IMAGE 
    const coverImage = await uploadOnCloudinary(coverImageLocalPath)

    if (!coverImage.url) {
        throw new ApiError(500, "Error while uploading the cover image")
    }

    const user = await User.findByIdAndUpdate(
        req.user?._id,
        {
            $set: {
                coverImage: coverImage.url
            } // means that we are setting the new cover image url in the database for the user
        },
        {new: true}
    ).select("-password")

    return res
    .status(200)
    .json(
        new ApiResponse(200, user, "Cover image updated successfully")
    )
})

// 



    export { registerUser, loginUser,logoutUser, refreshAccessToken , changeCurrentPassword, updateAccountDetails, updateUserAvtar, updateUserCoverImage,getCurrentUser};