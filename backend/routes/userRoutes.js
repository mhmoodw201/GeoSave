// routes/userRoutes.js
// مسارات المستخدمين

const express = require('express');
const router = express.Router();
const userModel = require('../models/userModel');
const bcrypt = require("bcrypt")
const jwt = require("jsonwebtoken")


// معلومات في صفحة المستخدم

router.get('/info', async (req, res) => {
    try {
        const userId = req.query.userId; // Get userId from query parameter

        const products = await userModel.find({ _id: userId });
        res.json(products);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});


// تسجيل مستخدم جديد
router.post("/register", async (req , res)=>{
    const {name, password, email} = req.body

    const admin = await userModel.findOne({email})
    if(admin){
    //the (&&) mean if the condition true do and there is no else if
    return res.json({message: "email already have"})
    }
    if(!admin){
    const hashedPassword = bcrypt.hashSync(password, 10)

    //The number of cycles to store
    const newAdmin = new userModel({name, email, password: hashedPassword});

    await newAdmin.save()

    const token = jwt.sign({id:newAdmin._id}, "mhmoodw")
    
    // Generates a token code specifically for the user
    return res.json({token, adminID: newAdmin._id, message: "admin created"})

    }
});

// تسجيل الدخول
router.post("/login", async (req, res)=>{
    const {email, password} = req.body


    const admin = await userModel.findOne({email})

    if(!admin){
    // !admin && res.json({message: "Email dose not exists!"})
    return res.json({message: "Email dose not exists!"})
    }

    if(admin){
    const isPasswordValid = await bcrypt.compare(password, admin.password);
     !isPasswordValid && res.json({message: "Username or Password is not correct"})

    if(isPasswordValid){
    var token = jwt.sign({id: admin._id}, "mhmoodw")
    // Generates a token code specifically for the user
    return res.json({token, adminID: admin._id, name: admin.name})
    }
    }
})

// تسجيل الخروج
router.post('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return res.status(500).json({ error: 'Failed to log out.' });
        }
        res.json({ message: 'Logged out successfully!' });
    });
});

module.exports = router;


