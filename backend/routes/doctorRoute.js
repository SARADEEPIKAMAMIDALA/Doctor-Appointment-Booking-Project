import express from "express";
import {
  appointmentCancel,
  appointmentComplete,
  doctorAppointments,
  doctorDashboard,
  doctorProfile,
  doctorsList,
  loginDoctor,
  updateDoctorProfile,
} from "../controllers/doctorController.js";
import { authDoctor } from "../middlewares/authDoctor.js";

const doctorRouter = express.Router();

doctorRouter.get("/list", doctorsList);
doctorRouter.post("/login", loginDoctor);
doctorRouter.get("/appointments", authDoctor, doctorAppointments);
doctorRouter.post("/cancel-appointment", authDoctor, appointmentCancel);
doctorRouter.post("/complete-appointment", authDoctor, appointmentComplete);
doctorRouter.get("/dashboard", authDoctor, doctorDashboard);
doctorRouter.get("/profile", authDoctor, doctorProfile);
doctorRouter.post("/update-profile", authDoctor, updateDoctorProfile);

export default doctorRouter;
