import validator from "validator";
import bcrypt from "bcrypt";
import userModel from "../models/userModels.js";
import jwt from "jsonwebtoken";
import { v2 as cloudinary } from "cloudinary";
import doctorModel from "../models/doctorModels.js";
import appointmentModel from "../models/appointmentModel.js";
import razorpay from "razorpay";
import crypto from "crypto";

// API to register user
const registerUser = async (req, res) => {
  try {
    const { name, email, password } = req.body; // Extract name, email, and password from the request body

    // Validate if all required fields are provided
    if (!name || !email || !password) {
      return res.json({ success: false, message: "Missing Details" });
    }

    // Validate the email format
    if (!validator.isEmail(email)) {
      return res.json({ success: false, message: "Enter a valid email" });
    }

    if (password.length < 8) {
      return res.json({ success: false, message: "Enter a strong password" });
    }

      // Check if the user already exists
      const existingUser = await userModel.findOne({ email: email.toLowerCase() });
      if (existingUser) {
        return res.json({ success: false, message: "User already exists. Please login" });
      }

    // Hash the user's password for secure storage
    const salt = await bcrypt.genSalt(10); // Generate a salt
    const hashedPassword = await bcrypt.hash(password, salt); // Hash the password with the salt

    // Prepare user data for saving to the database
    const userData = {
      name,
      email: email.toLowerCase(),
      password: hashedPassword,
    };

    // Create a new user document and save it to the database
    const newUser = new userModel(userData);
    const user = await newUser.save();

    // Generate a JWT token for the new user
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET); //generates a token with the user’s ID as part of the payload.
    res.json({ success: true, token });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to user login
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await userModel.findOne({ email: email.toLowerCase() }); // Find the user by email

    if (!user) {
      // If the user does not exist, return an error
      return res.json({ success: false, message: "User does not exist" });
    }

    // Compare the provided password with the stored hashed password
    const isMatch = await bcrypt.compare(password, user.password);

    if (isMatch) {
      // If the password matches, generate a JWT token
      const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
      res.json({ success: true, token });
    } else {
      res.json({ success: false, message: "Invalid Credentials" });
    }
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get User Profile Data
const getProfile = async (req, res) => {
  try {
    const { userId } = req.body;

    // Find the user by ID and exclude the password field
    const userData = await userModel.findById(userId).select("-password");

    // Respond with the user data
    res.json({ success: true, userData });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to update User Profile
const updateProfile = async (req, res) => {
  try {
    const { userId, name, dob, gender, phone, address } = req.body;

    // Extract the uploaded image file (if any)
    const imageFile = req.file;

    if (!name || !dob || !gender || !phone) {
      return res.json({ success: false, message: "data missing" });
    }

    // Update the user's profile details in the database
    await userModel.findByIdAndUpdate(userId, {
      name,
      phone,
      address: JSON.parse(address),
      dob,
      gender,
    });

    if (imageFile) {
      // If an image is uploaded, upload it to Cloudinary
      const imageUpload = await cloudinary.uploader.upload(imageFile.path, {
        resource_type: "image",
      });

      // Get the secure URL of the uploaded image
      const imageUrl = imageUpload.secure_url;

      // Update the user's profile with the new image URL
      await userModel.findByIdAndUpdate(userId, { image: imageUrl });
    }
    return res.json({ success: true, message: "Profile Updated" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to book appointment
const bookAppointment = async (req, res) => {
  try {
    // Extract data from the request body
    const { userId, docId, slotTime, slotDate } = req.body;

    // Fetch the doctor's data from the database (excluding password)
    const docData = await doctorModel.findById(docId).select("-password");

    // Check if the doctor exists
    if (!docData) {
      return res.json({ success: false, message: "Doctor not available" });
    }

    // Get the already booked slots for the doctor
    let slots_booked = docData.slots_booked;

    // checking for slot availability
    if (slots_booked[slotDate]) {
      if (slots_booked[slotDate].includes(slotTime)) {
        return res.json({ success: false, message: "Slots not available" });
      } else {
        // If the time slot is available, add it to the booked slots
        slots_booked[slotDate].push(slotTime);
      }
    } else {
      // If no slots exist for the given date, create a new array and add the slot
      slots_booked[slotDate] = [];
      slots_booked[slotDate].push(slotTime);
    }

    // Fetch the user's data from the database (excluding password)
    const userData = await userModel.findById(userId).select("-password");

    // Remove the slots_booked field from the doctor's data before saving it to the appointment
    //  console.log("slots booked ", docData.slots_booked)
    delete docData.slots_booked;

    // Create appointment data
    const appointmentData = {
      userId,
      docId,
      slotTime,
      slotDate,
      userData,
      docData,
      date: Date.now(),
      amount: docData.fees,
    };

    const newAppointment = new appointmentModel(appointmentData);
    await newAppointment.save(); // Save the new appointment data in the database

    // save new slots data in docData / Update the doctor's booked slots in the database
    await doctorModel.findByIdAndUpdate(docId, { slots_booked });
    return res.json({ success: true, message: "Appointment Booked" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to get user appointments for frontend my-appointments page
const listAppointments = async (req, res) => {
  try {
    const { userId } = req.body;
    const appointments = await appointmentModel.find({ userId });
    return res.json({ success: true, appointments });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to cancel the appointment
const cancelAppointment = async (req, res) => {
  try {
    const { userId, appointmentId } = req.body;
    const appointmentData = await appointmentModel.findById(appointmentId);

    // verify appointment user
    if (appointmentData.userId !== userId) {
      return res.json({ success: false, message: "Unauthorized action" });
    }

    await appointmentModel.findByIdAndUpdate(appointmentId, {
      cancelled: true,
    });

    // releasing that doctor
    const { docId, slotDate, slotTime } = appointmentData;
    const doctorData = await doctorModel.findById(docId);

    let slots_booked = doctorData.slots_booked;
    slots_booked[slotDate] = slots_booked[slotDate].filter(
      (e) => e !== slotTime
    );

    await doctorModel.findByIdAndUpdate(docId, { slots_booked });

    res.json({ success: true, message: "Appointment cancelled" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to make payment using razorpay

const razorpayInstance = new razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

const paymentRazorpay = async (req, res) => {
  try {
    const { appointmentId } = req.body;

    const appointmentData = await appointmentModel.findById(appointmentId);

    if (!appointmentData || appointmentData.cancelled) {
      return res.json({
        success: false,
        message: "Appointment cancelled or Not found",
      });
    }

    // creating options for razorpay payments
    const options = {
      amount: appointmentData.amount * 100,
      currency: process.env.CURRENCY,
      receipt: appointmentId,
    };

    // creation of an order
    const order = await razorpayInstance.orders.create(options);
    console.log("order...", order);
    res.json({ success: true, order });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};

// API to verify razorpay payment

const verifyPayment = async (req, res) => {
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    // Validate the Razorpay payment signature
    const generatedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: "Invalid payment signature",
      });
    }

    // Fetch the order information to confirm the status
    const orderInfo = await razorpayInstance.orders.fetch(razorpay_order_id);

    if (orderInfo.status === "paid") {
      // Update the appointment as paid
      await appointmentModel.findByIdAndUpdate(orderInfo.receipt, {
        payment: true,
      });
  
      console.log("Fetched orderInfo:", orderInfo);
      
      res.status(200).json({ success: true, message: "Payment successful" });
    } else {
      res.status(400).json({ success: false, message: "Payment not successful" });
    }
  } catch (error) {
    console.error("Error verifying payment:", error);
    res.status(500).json({ success: false, message: "Payment verification failed" });
  }
};


export {
  registerUser,
  loginUser,
  getProfile,
  updateProfile,
  bookAppointment,
  listAppointments,
  cancelAppointment,
  paymentRazorpay,
  verifyPayment,
};
