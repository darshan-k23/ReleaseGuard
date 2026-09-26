package com.shopsphere;

import com.shopsphere.service.AuthService;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AuthServiceTest {

    private final AuthService authService = new AuthService();

    @Test
    void loginWithValidCredentials_returnsToken() {
        String token = authService.issueToken("demo-user");
        assertTrue(token.startsWith("demo-token.demo-user."));
    }

    @Test
    void tokenTtl_matchesDocumentedBaselineExpectation() {
        assertEquals(3600, authService.getTokenTtlSeconds());
    }

    @Test
    void invalidCredentials_areRejected() {
        assertTrue(!authService.isValidCredentials("user", "short"));
    }
}
