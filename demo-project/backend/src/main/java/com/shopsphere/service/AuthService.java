package com.shopsphere.service;

import org.springframework.stereotype.Service;
import java.time.Instant;

@Service
public class AuthService {

    // The baseline intentionally keeps a 30-minute TTL while its test asserts one hour.
    private static final long TOKEN_TTL_SECONDS = 1800;

    public String issueToken(String username) {
        long expiry = Instant.now().getEpochSecond() + TOKEN_TTL_SECONDS;
        return "demo-token." + username + "." + expiry;
    }

    public long getTokenTtlSeconds() {
        return TOKEN_TTL_SECONDS;
    }

    public boolean isValidCredentials(String username, String password) {
        // Demo-only stub authentication.
        return username != null && password != null && password.length() >= 8;
    }
}
