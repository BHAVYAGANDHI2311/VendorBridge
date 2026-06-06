from fastapi import APIRouter, HTTPException, status, Depends
from datetime import datetime, timedelta
from bson import ObjectId
from models import UserSignup, UserLogin, ForgotPassword, Token, ResetPassword
from auth import (
    verify_password, get_password_hash, create_access_token,
    validate_password_strength, get_current_active_user
)
from config import users_collection, ACCESS_TOKEN_EXPIRE_MINUTES
import re
import secrets

router = APIRouter(prefix="/auth", tags=["Authentication"])


def serialize_user(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "full_name": user.get("full_name", ""),
        "email": user["email"],
        "role": user["role"],
        "company": user.get("company"),
        "gstin": user.get("gstin"),
        "address": user.get("address", ""),
        "phone": user.get("phone", ""),
        "is_active": user.get("is_active", True),
        "created_at": user.get("created_at", datetime.utcnow()).isoformat(),
    }


@router.post("/signup", status_code=status.HTTP_201_CREATED)
async def signup(user_data: UserSignup):
    # Check existing email
    existing = await users_collection.find_one({"email": user_data.email})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    # Validate password strength
    if not validate_password_strength(user_data.password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters with 1 uppercase, 1 number, and 1 special character"
        )

    hashed_password = get_password_hash(user_data.password)
    new_user = {
        "full_name": user_data.full_name,
        "email": user_data.email,
        "password": hashed_password,
        "role": user_data.role.value,
        "company": user_data.company,
        "gstin": user_data.gstin,
        "phone": user_data.phone,
        "is_active": True,
        "created_at": datetime.utcnow(),
    }

    result = await users_collection.insert_one(new_user)
    new_user["_id"] = result.inserted_id

    access_token = create_access_token(
        data={"sub": user_data.email, "role": user_data.role.value},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "message": "Account created successfully",
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user(new_user)
    }


@router.post("/login")
async def login(user_data: UserLogin):
    user = await users_collection.find_one({"email": user_data.email})

    if not user or not verify_password(user_data.password, user["password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password"
        )

    # Role check (only if role was supplied, i.e. for backward compatibility / tests)
    if user_data.role and user.get("role") != user_data.role.value:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Access denied: Your role is '{user.get('role')}', not '{user_data.role.value}'"
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account has been deactivated"
        )

    access_token = create_access_token(
        data={"sub": user["email"], "role": user["role"]},
        expires_delta=timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    )

    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "user": serialize_user(user)
    }


@router.post("/forgot-password")
async def forgot_password(data: ForgotPassword):
    user = await users_collection.find_one({"email": data.email})
    if user:
        token = secrets.token_urlsafe(32)
        expire = datetime.utcnow() + timedelta(minutes=15)
        await users_collection.update_one(
            {"_id": user["_id"]},
            {"$set": {"reset_token": token, "reset_token_expires": expire}}
        )
        # Simulate sending email notifications
        print(f"\n[EMAIL SIMULATION] Password reset request for {data.email}")
        print(f"[EMAIL SIMULATION] Reset link: http://localhost:3000/reset-password.html?token={token}")
        print(f"[EMAIL SIMULATION] Token: {token}\n")
    # Always return success to prevent email enumeration
    return {
        "message": "If an account with that email exists, a password reset link has been sent."
    }


@router.post("/reset-password")
async def reset_password(data: ResetPassword):
    if not validate_password_strength(data.new_password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters with 1 uppercase, 1 number, and 1 special character"
        )
    user = await users_collection.find_one({
        "reset_token": data.token,
        "reset_token_expires": {"$gt": datetime.utcnow()}
    })
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired reset token"
        )
    hashed_password = get_password_hash(data.new_password)
    await users_collection.update_one(
        {"_id": user["_id"]},
        {
            "$set": {"password": hashed_password},
            "$unset": {"reset_token": "", "reset_token_expires": ""}
        }
    )
    return {"message": "Password reset successfully"}


@router.get("/me")
async def get_me(current_user=Depends(get_current_active_user)):
    return serialize_user(current_user)


@router.post("/logout")
async def logout(current_user=Depends(get_current_active_user)):
    return {"message": "Logged out successfully"}
