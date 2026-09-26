package com.shopsphere.controller;

import com.shopsphere.service.AuthService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    @Autowired
    private AuthService authService;

    @PostMapping("/login")
    public String login(@RequestBody LoginRequest request) {
        if (!authService.isValidCredentials(request.username, request.password)) {
            throw new IllegalArgumentException("Invalid credentials");
        }
        return authService.issueToken(request.username);
    }

    public static class LoginRequest {
        public String username;
        public String password;
    }
}
